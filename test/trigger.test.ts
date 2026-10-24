import { createHmac } from 'crypto';
import type { IDataObject, IHookFunctions, IHttpRequestOptions, IWebhookFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';
import { ReachHuntTrigger } from '../nodes/ReachHuntTrigger/ReachHuntTrigger.node';
import { NODE, ok, type MockResponse } from './helpers';

const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc/webhook';
const trigger = new ReachHuntTrigger();
const hooks = trigger.webhookMethods.default;

function hookContext(responses: MockResponse[], staticData: IDataObject = {}, url = WEBHOOK_URL) {
	const requests: IHttpRequestOptions[] = [];
	const queue = [...responses];
	const warn = vi.fn();
	const context = {
		getNode: () => NODE,
		getWorkflow: () => ({ id: 'wf1', name: 'Replies to HubSpot', active: true }),
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => url,
		getNodeParameter: () => ['message.received', 'campaign.lead_replied'],
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: 'https://api.reachhunt.ai/api/v1' }),
		logger: { warn },
		helpers: {
			httpRequestWithAuthentication: vi.fn(async (_credential: string, options: IHttpRequestOptions) => {
				requests.push(options);
				const next = queue.shift();
				if (!next) throw new Error('No mock response left');
				return { statusCode: next.statusCode ?? 200, headers: {}, body: next.body };
			}),
		},
	};
	return { context: context as unknown as IHookFunctions, requests, staticData, warn };
}

describe('ReachHunt Trigger webhook lifecycle', () => {
	it('creates the webhook and keeps its ID and secret', async () => {
		const { context, requests, staticData } = hookContext([ok({ id: 'wh1', secret: 'rh_wh_secret' })]);
		expect(await hooks.create.call(context)).toBe(true);
		expect(requests[0]).toMatchObject({
			method: 'POST',
			url: '/webhooks',
			body: { name: 'n8n: Replies to HubSpot', url: WEBHOOK_URL, events: ['message.received', 'campaign.lead_replied'] },
		});
		expect(staticData).toEqual({ webhookId: 'wh1', webhookSecret: 'rh_wh_secret' });
	});

	it('explains why a local n8n address is refused', async () => {
		const { context } = hookContext(
			[{ statusCode: 200, body: { status: false, data: null, error: 'The URL must start with https://' } }],
			{},
			'http://localhost:5678/webhook/abc/webhook',
		);
		const error = await hooks.create.call(context).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('The URL must start with https://');
		expect((error as NodeApiError).description).toContain('WEBHOOK_URL');
	});

	it('reuses a webhook that still matches and picks up a rotated secret', async () => {
		const { context, requests, staticData } = hookContext(
			[
				ok([
					{
						id: 'wh1',
						url: WEBHOOK_URL,
						status: 'active',
						events: ['campaign.lead_replied', 'message.received'],
					},
				]),
				ok({ secret: 'rh_wh_rotated' }),
			],
			{ webhookId: 'wh1', webhookSecret: 'rh_wh_secret' },
		);
		expect(await hooks.checkExists.call(context)).toBe(true);
		expect(requests[1]).toMatchObject({ method: 'GET', url: '/webhooks/wh1/secret' });
		expect(staticData).toEqual({ webhookId: 'wh1', webhookSecret: 'rh_wh_rotated' });
	});

	it('replaces a webhook that ReachHunt turned off', async () => {
		const { context, requests, staticData } = hookContext(
			[
				ok([{ id: 'wh1', url: WEBHOOK_URL, status: 'disabled', events: ['message.received', 'campaign.lead_replied'] }]),
				ok({ deleted: true }),
			],
			{ webhookId: 'wh1', webhookSecret: 'rh_wh_secret' },
		);
		expect(await hooks.checkExists.call(context)).toBe(false);
		expect(requests[1]).toMatchObject({ method: 'DELETE', url: '/webhooks/wh1' });
		expect(staticData).toEqual({});
	});

	it('deletes the webhook and treats a missing one as deleted', async () => {
		const deleted = hookContext([ok({ deleted: true })], { webhookId: 'wh1', webhookSecret: 's' });
		expect(await hooks.delete.call(deleted.context)).toBe(true);
		expect(deleted.staticData).toEqual({});

		const missing = hookContext(
			[{ statusCode: 200, body: { status: false, data: null, error: 'Webhook not found' } }],
			{ webhookId: 'wh1', webhookSecret: 's' },
		);
		expect(await hooks.delete.call(missing.context)).toBe(true);
	});

	it('keeps the webhook ID when deleting fails for another reason', async () => {
		const failing = hookContext([{ statusCode: 500, body: { status: false, error: null } }], {
			webhookId: 'wh1',
			webhookSecret: 's',
		});
		expect(await hooks.delete.call(failing.context)).toBe(false);
		expect(failing.staticData.webhookId).toBe('wh1');
		expect(failing.warn).toHaveBeenCalled();
	});
});

describe('ReachHunt Trigger deliveries', () => {
	const secret = 'rh_wh_secret';
	const event = { id: 'evt_1', type: 'message.received', createdAt: '2026-10-20T10:00:00.000Z', data: { text: 'Hi' } };

	function webhookContext(body: IDataObject, signature: string | undefined, raw = JSON.stringify(body)) {
		const json = vi.fn();
		const status = vi.fn(() => ({ json }));
		const context = {
			getWorkflowStaticData: () => ({ webhookId: 'wh1', webhookSecret: secret }),
			getRequestObject: () => ({ rawBody: Buffer.from(raw), body }),
			getResponseObject: () => ({ status }),
			getHeaderData: () => (signature ? { 'x-reachhunt-signature': signature } : {}),
			getBodyData: () => body,
			getNodeParameter: () => ['message.received'],
			helpers: { returnJsonArray: (data: IDataObject) => [{ json: data }] },
		};
		return { context: context as unknown as IWebhookFunctions, status, json };
	}

	const sign = (raw: string) => {
		const timestamp = Math.floor(Date.now() / 1000);
		return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`;
	};

	it('starts the workflow for a signed event', async () => {
		const raw = JSON.stringify(event);
		const { context } = webhookContext(event, sign(raw), raw);
		expect(await trigger.webhook.call(context)).toEqual({ workflowData: [[{ json: event }]] });
	});

	it('refuses an unsigned or tampered event', async () => {
		const unsigned = webhookContext(event, undefined);
		expect(await trigger.webhook.call(unsigned.context)).toEqual({ noWebhookResponse: true });
		expect(unsigned.status).toHaveBeenCalledWith(401);

		const tampered = webhookContext(event, sign('{"id":"other"}'));
		expect(await trigger.webhook.call(tampered.context)).toEqual({ noWebhookResponse: true });
	});

	it('ignores events the node did not ask for', async () => {
		const other = { ...event, type: 'tag.created' };
		const raw = JSON.stringify(other);
		const { context } = webhookContext(other, sign(raw), raw);
		expect(await trigger.webhook.call(context)).toEqual({ webhookResponse: { received: true } });
	});
});
