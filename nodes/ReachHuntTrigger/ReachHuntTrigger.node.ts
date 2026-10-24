import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { apiRequest } from '../ReachHunt/transport';
import { SIGNATURE_HEADER, verifySignature } from './signature';

const WEBHOOK_NAME_LIMIT = 60;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];

interface Webhook {
	id: string;
	url: string;
	events: string[];
	status: string;
}

const eventName = (type: string): string =>
	type
		.split(/[._]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

const sameEvents = (a: string[], b: string[]): boolean =>
	a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

const isPublicHttps = (url: string): boolean => {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === 'https:' && !LOCAL_HOSTS.includes(hostname) && !hostname.endsWith('.local');
	} catch {
		return false;
	}
};

const webhookPath = (id: string) => `/webhooks/${encodeURIComponent(id)}`;

export class ReachHuntTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ReachHunt Trigger',
		name: 'reachHuntTrigger',
		icon: { light: 'file:../ReachHunt/reachhunt.svg', dark: 'file:../ReachHunt/reachhunt.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when something happens in ReachHunt',
		defaults: {
			name: 'ReachHunt Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'reachHuntApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				responseData: 'noData',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getEvents' },
				required: true,
				default: [],
				description:
					'The events that start the workflow. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const events = await apiRequest.call(this, 'GET', '/webhooks/events');
				return (Array.isArray(events) ? (events as IDataObject[]) : []).map((event) => ({
					name: eventName(String(event.type)),
					value: String(event.type),
					description: String(event.description ?? ''),
				}));
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) return false;

				const webhooks = await apiRequest.call(this, 'GET', '/webhooks');
				const existing = (Array.isArray(webhooks) ? (webhooks as Webhook[]) : []).find(
					(webhook) => webhook.id === webhookId,
				);
				const events = this.getNodeParameter('events') as string[];
				const matches =
					!!existing &&
					existing.status === 'active' &&
					existing.url === this.getNodeWebhookUrl('default') &&
					sameEvents(existing.events, events);
				if (matches) {
					const latest = (await apiRequest.call(this, 'GET', `${webhookPath(webhookId)}/secret`)) as IDataObject | null;
					if (typeof latest?.secret === 'string' && latest.secret) {
						staticData.webhookSecret = latest.secret;
						return true;
					}
				}

				if (existing) await apiRequest.call(this, 'DELETE', webhookPath(webhookId));
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') ?? '';
				const events = this.getNodeParameter('events') as string[];
				const name = `n8n: ${this.getWorkflow().name || 'workflow'}`.slice(0, WEBHOOK_NAME_LIMIT);

				let webhook: unknown;
				try {
					webhook = await apiRequest.call(this, 'POST', '/webhooks', { body: { name, url, events } });
				} catch (error) {
					if (error instanceof NodeApiError && !isPublicHttps(url)) {
						error.description = `ReachHunt sends events only to a public https:// address, and this n8n gives ${url}. Set WEBHOOK_URL in n8n to a public https:// address, for example a tunnel.`;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				const created = (webhook ?? {}) as IDataObject;
				if (typeof created.id !== 'string' || typeof created.secret !== 'string') return false;
				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = created.id;
				staticData.webhookSecret = created.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (webhookId) {
					try {
						await apiRequest.call(this, 'DELETE', webhookPath(webhookId));
					} catch (error) {
						const httpCode = (error as NodeApiError).httpCode;
						if (httpCode !== '404' && !/not found/i.test((error as Error).message)) {
							this.logger.warn(`Could not delete the ReachHunt webhook ${webhookId}`, {
								error: (error as Error).message,
							});
							return false;
						}
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const secret = this.getWorkflowStaticData('node').webhookSecret as string | undefined;
		const rawBody = Buffer.isBuffer(request.rawBody)
			? request.rawBody.toString('utf8')
			: JSON.stringify(request.body ?? {});

		if (!secret || !verifySignature(this.getHeaderData()[SIGNATURE_HEADER], rawBody, secret)) {
			this.getResponseObject().status(401).json({ error: 'Invalid signature' });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData();
		const events = this.getNodeParameter('events') as string[];
		if (typeof body.type === 'string' && !events.includes(body.type)) {
			return { webhookResponse: { received: true } };
		}
		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
