import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { runOperation } from '../nodes/ReachHunt/execute';
import { ReachHunt } from '../nodes/ReachHunt/ReachHunt.node';
import { createExecuteContext, locator, ok } from './helpers';

const run = async (
	resource: string,
	operation: string,
	parameters: Record<string, unknown>,
	responses: Parameters<typeof createExecuteContext>[1],
	options?: Parameters<typeof createExecuteContext>[2],
) => {
	const mock = createExecuteContext({ resource, operation, ...parameters }, responses, options);
	const result = await runOperation.call(mock.context, resource, operation, 0);
	return { result, ...mock };
};

describe('runOperation', () => {
	it('sends a message with the conversation ID encoded in the path', async () => {
		const { result, requests } = await run(
			'message',
			'send',
			{ accountId: locator('acc_1'), conversationId: '123:456', text: 'Hi there\n', options: {} },
			[ok({ messageId: 'm1', message: { id: 'm1' } })],
		);
		expect(requests[0]).toMatchObject({
			method: 'POST',
			baseURL: 'http://localhost:5001/api/v1',
			url: '/conversations/123%3A456/messages',
			body: { accountId: 'acc_1', text: 'Hi there\n' },
			arrayFormat: 'repeat',
			ignoreHttpStatusErrors: true,
		});
		expect(result).toEqual([{ messageId: 'm1', message: { id: 'm1' } }]);
	});

	it('turns status false on HTTP 200 into an error with the API message', async () => {
		const error = await run('campaign', 'start', { campaignId: locator('c1') }, [
			{ statusCode: 200, body: { status: false, data: null, error: 'Campaign not found' } },
		]).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('Campaign not found');
		expect((error as NodeApiError).httpCode).toBeNull();
	});

	it('explains a rejected API key', async () => {
		const error = await run('account', 'getAll', { returnAll: true, filters: {} }, [
			{ statusCode: 401, body: { status: false, data: null, error: 'Invalid API key' } },
		]).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('Invalid API key');
		expect((error as NodeApiError).description).toContain('Settings → API');
		expect((error as NodeApiError).httpCode).toBe('401');
	});

	it('handles a non-JSON error page', async () => {
		const error = await run('workspace', 'getCredits', {}, [{ statusCode: 502, body: '<html>Bad gateway</html>' }]).catch(
			(caught: unknown) => caught,
		);
		expect((error as NodeApiError).message).toBe('ReachHunt had a problem. Try again in a moment.');
	});

	it('follows the cursor when returning all conversations', async () => {
		const { result, requests } = await run(
			'conversation',
			'getAll',
			{ returnAll: true, filters: { tagId: ['t1', 't2'], scope: 'unread' } },
			[ok({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'next' }), ok({ items: [{ id: 'c' }], nextCursor: null })],
		);
		expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
		expect(requests[0].qs).toEqual({ tagId: ['t1', 't2'], scope: 'unread', limit: 100 });
		expect(requests[1].qs).toEqual({ tagId: ['t1', 't2'], scope: 'unread', limit: 100, cursor: 'next' });
	});

	it('pages until the limit and keeps the page size fixed', async () => {
		const page = (start: number, count: number) =>
			Array.from({ length: count }, (_, index) => ({ id: String(start + index) }));
		const { result, requests } = await run('campaign', 'getAll', { returnAll: false, limit: 120, filters: {} }, [
			ok({ items: page(0, 100), page: 1, totalPages: 3 }),
			ok({ items: page(100, 100), page: 2, totalPages: 3 }),
		]);
		expect(result).toHaveLength(120);
		expect(requests.map((request) => request.qs)).toEqual([
			{ page: 1, limit: 100 },
			{ page: 2, limit: 100 },
		]);
	});

	it('stops on the last page even when the API repeats it', async () => {
		const { result, requests } = await run('leadList', 'getAll', { returnAll: true, filters: {} }, [
			ok({ items: [{ id: 'l1' }], page: 1, totalPages: 1 }),
		]);
		expect(result).toEqual([{ id: 'l1' }]);
		expect(requests).toHaveLength(1);
	});

	it('splits a bare array and applies the limit', async () => {
		const { result } = await run('account', 'getAll', { returnAll: false, limit: 1, filters: {} }, [
			ok([{ id: 'acc_1' }, { id: 'acc_2' }]),
		]);
		expect(result).toEqual([{ id: 'acc_1' }]);
	});

	it('unwraps single objects', async () => {
		const { result } = await run('conversation', 'get', { conversationId: 'c1' }, [
			ok({ conversation: { id: 'c1', name: 'Jane' } }),
		]);
		expect(result).toEqual([{ id: 'c1', name: 'Jane' }]);
	});

	it('returns one item per added lead', async () => {
		const { result } = await run(
			'leadList',
			'addLeads',
			{ leadListId: locator('l1'), platformIds: 'p1, p2', options: {} },
			[ok({ prospects: [{ id: 'p1' }, { id: 'p2' }] })],
		);
		expect(result).toEqual([{ id: 'p1' }, { id: 'p2' }]);
	});

	it('converts a local send time in the workflow time zone', async () => {
		const { requests } = await run(
			'scheduledMessage',
			'create',
			{ accountId: locator('acc_1'), conversationId: 'c1', text: 'Later', sendAt: '2026-10-21T10:00:00', additionalFields: {} },
			[ok({ id: 's1' })],
			{ timezone: 'Asia/Kolkata' },
		);
		expect(requests[0].body).toMatchObject({ sendAt: '2026-10-21T04:30:00.000Z' });
	});

	it('clears a status when it is left empty', async () => {
		const { requests } = await run(
			'conversation',
			'setStatus',
			{ accountId: locator('acc_1'), conversationId: 'c1', statusId: locator('') },
			[ok({ status: null, changed: true })],
		);
		expect(requests[0]).toMatchObject({ method: 'PUT', body: { accountId: 'acc_1', statusId: null } });
	});

	it('splits comma-separated IDs and reads tag pickers', async () => {
		const { requests } = await run('lead', 'updateTags', { ids: ' a, b ,,c ', add: ['t1'], remove: [] }, [
			ok({ applied: 3, removed: 0 }),
		]);
		expect(requests[0].body).toEqual({ ids: ['a', 'b', 'c'], add: ['t1'] });
	});

	it('maps a renamed parameter back to the API field', async () => {
		const { requests } = await run(
			'request',
			'answer',
			{ accountId: locator('acc_1'), requestId: 'r1', requestAction: 'ignore', options: {} },
			[ok({ requestId: 'r1', action: 'ignore', ok: true })],
		);
		expect(requests[0]).toMatchObject({ url: '/requests/r1/action', body: { accountId: 'acc_1', action: 'ignore' } });
	});

	it('reads template variants from the list', async () => {
		const { requests } = await run(
			'template',
			'create',
			{ name: 'Intro', additionalFields: { variants: { values: [{ text: 'Hi' }, { text: ' ' }, { text: 'Hello' }] } } },
			[ok({ template: { id: 't1' } })],
		);
		expect(requests[0].body).toEqual({ name: 'Intro', variants: ['Hi', 'Hello'] });
	});

	it('parses JSON fields and rejects broken JSON', async () => {
		const { requests } = await run(
			'campaign',
			'create',
			{ name: 'Founders', additionalFields: { audience: '[{"leadListId":"l1","mode":"include"}]', autoTranslate: true } },
			[ok({ campaign: { id: 'c1' } })],
		);
		expect(requests[0].body).toEqual({
			name: 'Founders',
			audience: [{ leadListId: 'l1', mode: 'include' }],
			autoTranslate: true,
		});

		const error = await run('campaign', 'create', { name: 'Founders', additionalFields: { audience: '[{' } }, []).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as Error).message).toBe('Audience must be valid JSON');
	});

	it('requires a path value before calling the API', async () => {
		const error = await run('campaign', 'get', { campaignId: locator('') }, []).catch((caught: unknown) => caught);
		expect((error as Error).message).toBe('Campaign is required');
	});

	it('sends POST requests without a body when there are no fields', async () => {
		const { requests } = await run('campaign', 'pause', { campaignId: locator('c1') }, [ok({ campaign: { id: 'c1' } })]);
		expect(requests[0]).toMatchObject({ method: 'POST', url: '/campaigns/c1/pause' });
		expect(requests[0].body).toBeUndefined();
	});
});

describe('ReachHunt node', () => {
	it('keeps going with the error as output when continue on fail is on', async () => {
		const mock = createExecuteContext(
			{ resource: 'campaign', operation: 'start', campaignId: locator('c1') },
			[{ statusCode: 200, body: { status: false, data: null, error: 'Campaign not found' } }],
			{ continueOnFail: true },
		);
		const output = await new ReachHunt().execute.call(mock.context);
		expect(output).toEqual([[{ json: { error: 'Campaign not found' }, pairedItem: { item: 0 } }]]);
	});

	it('pairs every output item with its input', async () => {
		const mock = createExecuteContext({ resource: 'tag', operation: 'getAll', returnAll: true }, [
			ok({ tags: [{ id: 't1' }, { id: 't2' }] }),
		]);
		const output = await new ReachHunt().execute.call(mock.context);
		expect(output[0]).toEqual([
			{ json: { id: 't1' }, pairedItem: { item: 0 } },
			{ json: { id: 't2' }, pairedItem: { item: 0 } },
		]);
	});
});
