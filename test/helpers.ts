import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';
import { vi } from 'vitest';

export interface MockResponse {
	statusCode?: number;
	body: unknown;
}

export const NODE: INode = {
	id: 'node-id',
	name: 'ReachHunt',
	type: 'n8n-nodes-reachhunt.reachHunt',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export const ok = (data: unknown): MockResponse => ({ statusCode: 200, body: { status: true, data, error: null } });

export function createExecuteContext(
	parameters: IDataObject,
	responses: MockResponse[],
	{ timezone = 'UTC', continueOnFail = false } = {},
) {
	const requests: IHttpRequestOptions[] = [];
	const queue = [...responses];
	const httpRequestWithAuthentication = vi.fn(async (_credential: string, options: IHttpRequestOptions) => {
		requests.push(options);
		const next = queue.shift();
		if (!next) throw new Error(`No mock response left for ${options.method} ${options.url}`);
		return { statusCode: next.statusCode ?? 200, headers: {}, body: next.body };
	});

	const context = {
		getNode: () => NODE,
		getTimezone: () => timezone,
		continueOnFail: () => continueOnFail,
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: 'http://localhost:5001/api/v1/' }),
		getNodeParameter: (
			name: string,
			_itemIndex: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) => {
			const value = name in parameters ? parameters[name] : fallback;
			if (options?.extractValue && value && typeof value === 'object' && '__rl' in value) {
				return (value as IDataObject).value;
			}
			return value;
		},
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (items: IDataObject[]) => items.map((json) => ({ json })),
			constructExecutionMetaData: (items: Array<{ json: IDataObject }>, { itemData }: { itemData: IDataObject }) =>
				items.map((item) => ({ ...item, pairedItem: itemData })),
		},
	};

	return { context: context as unknown as IExecuteFunctions, requests, httpRequestWithAuthentication };
}

export const locator = (value: string) => ({ __rl: true, mode: 'list', value });
