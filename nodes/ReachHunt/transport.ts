import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'reachHuntApi';
export const DEFAULT_BASE_URL = 'https://api.reachhunt.ai/api/v1';

export type ApiContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export interface ApiRequest {
	qs?: IDataObject;
	body?: IDataObject;
	itemIndex?: number;
}

interface Envelope {
	status?: boolean;
	data?: unknown;
	error?: string | null;
}

const FALLBACK_MESSAGES: Record<number, string> = {
	401: 'ReachHunt did not accept the API key',
	402: 'The ReachHunt plan does not allow this',
	404: 'ReachHunt could not find this',
	429: 'Too many requests to ReachHunt',
};

const HINTS: Record<number, string> = {
	401: 'Create a new API key in ReachHunt under Settings → API and update the credential.',
	402: 'Check the plan of the workspace in ReachHunt under Settings → Billing.',
	429: 'Wait a minute and try again.',
};

const toEnvelope = (body: unknown): Envelope => {
	if (body && typeof body === 'object') return body as Envelope;
	if (typeof body !== 'string') return {};
	try {
		const parsed: unknown = JSON.parse(body);
		return parsed && typeof parsed === 'object' ? (parsed as Envelope) : {};
	} catch {
		return {};
	}
};

export const baseUrlOf = (credentials: IDataObject): string =>
	String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

export async function apiRequest(
	this: ApiContext,
	method: IHttpRequestMethods,
	path: string,
	{ qs, body, itemIndex }: ApiRequest = {},
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const options: IHttpRequestOptions = {
		method,
		baseURL: baseUrlOf(credentials),
		url: path,
		json: true,
		arrayFormat: 'repeat',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (qs && Object.keys(qs).length) options.qs = qs;
	if (body && method !== 'GET') options.body = body;

	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			itemIndex,
			message: 'Could not reach ReachHunt',
			description: (error as Error).message,
		});
	}

	const status = response.statusCode;
	const envelope = toEnvelope(response.body);
	if (status >= 200 && status < 300 && envelope.status !== false) return envelope.data ?? null;

	const message =
		envelope.error ||
		FALLBACK_MESSAGES[status] ||
		(status >= 500 ? 'ReachHunt had a problem. Try again in a moment.' : `ReachHunt answered with status ${status}`);
	throw new NodeApiError(this.getNode(), envelope as JsonObject, {
		itemIndex,
		message,
		description: HINTS[status],
		...(status >= 300 ? { httpCode: String(status) } : {}),
	});
}
