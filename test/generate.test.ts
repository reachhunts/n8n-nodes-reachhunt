import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import * as catalog from '../scripts/catalog.mjs';
import { buildNode, finishDescription, humanize, readOutput, readSpec, render } from '../scripts/generate.mjs';
import { operations } from '../nodes/ReachHunt/generated/operations';
import { properties } from '../nodes/ReachHunt/generated/properties';
import { listSearch, loadOptions } from '../nodes/ReachHunt/methods';

const spec = readSpec();

const findProperty = (name: string, resource: string, operation: string) =>
	(properties as INodeProperties[]).find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes(resource) &&
			property.displayOptions?.show?.operation?.includes(operation),
	);

describe('generated files', () => {
	it('match the spec and the catalog', async () => {
		const files = await render(spec);
		for (const [path, content] of Object.entries(files)) {
			expect(readOutput(path), `${path} is stale, run npm run generate`).toBe(content);
		}
	});

	it('cover every catalog operation', () => {
		expect(Object.keys(operations)).toHaveLength(catalog.OPERATIONS.length);
		expect(catalog.OPERATIONS).toHaveLength(67);
		for (const entry of catalog.OPERATIONS) {
			const operationParameter = (properties as INodeProperties[]).find(
				(property) => property.name === 'operation' && property.displayOptions?.show?.resource?.includes(entry.resource),
			);
			expect(operationParameter?.options?.some((option) => 'value' in option && option.value === entry.value)).toBe(true);
		}
	});

	it('only point dropdowns at methods the node has', () => {
		const searchMethods = new Set(Object.keys(listSearch));
		const loadMethods = new Set(Object.keys(loadOptions));
		const visit = (items: unknown[]) => {
			for (const item of items as Array<Record<string, unknown>>) {
				const typeOptions = item.typeOptions as Record<string, string> | undefined;
				if (typeOptions?.loadOptionsMethod) expect(loadMethods).toContain(typeOptions.loadOptionsMethod);
				if (typeOptions?.searchListMethod) expect(searchMethods).toContain(typeOptions.searchListMethod);
				for (const key of ['options', 'modes', 'values']) {
					if (Array.isArray(item[key])) visit(item[key] as unknown[]);
				}
			}
		};
		visit(properties);
	});

	it('pick the right paging for lists', () => {
		expect(operations['conversation:getAll'].list).toEqual({ key: 'items', paging: 'cursor' });
		expect(operations['message:getAll'].list).toEqual({ key: 'items', paging: 'cursor' });
		expect(operations['campaign:getAll'].list).toEqual({ key: 'items', paging: 'page' });
		expect(operations['lead:search'].list).toEqual({ key: 'items', paging: 'page' });
		expect(operations['account:getAll'].list).toEqual({ key: '' });
		expect(operations['tag:getAll'].list).toEqual({ key: 'tags' });
		expect(operations['leadList:addLeads'].list).toBeUndefined();
		expect(operations['leadList:addLeads'].unwrap).toBe('prospects');
		expect(operations['conversation:get'].unwrap).toBe('conversation');
	});

	it('keep account first and use dropdowns for IDs', () => {
		const sendFields = operations['message:send'].fields.filter((field) => !field.group).map((field) => field.name);
		expect(sendFields).toEqual(['accountId', 'conversationId', 'text']);
		expect(findProperty('accountId', 'message', 'send')?.type).toBe('resourceLocator');
		expect(findProperty('campaignId', 'campaign', 'start')?.type).toBe('resourceLocator');
		expect(findProperty('text', 'message', 'send')?.required).toBe(true);
		expect(findProperty('returnAll', 'conversation', 'getAll')).toBeDefined();
		expect(findProperty('returnAll', 'leadList', 'addLeads')).toBeUndefined();
	});

	it('leave a nullable status optional so it can be cleared', () => {
		expect(findProperty('statusId', 'conversation', 'setStatus')?.required).toBeUndefined();
		expect(operations['conversation:setStatus'].fields.find((field) => field.name === 'statusId')?.nullable).toBe(true);
	});

	it('fail loudly on a catalog field the spec does not have', () => {
		const broken = {
			...catalog,
			OPERATIONS: [{ ...catalog.OPERATIONS[0], fields: { nope: { top: true } } }],
		};
		expect(() => buildNode(spec, broken)).toThrow('catalog fields not in the spec: nope');
	});
});

describe('text helpers', () => {
	it('title-case field names like n8n expects', () => {
		expect(humanize('replyToMessageId')).toBe('Reply to Message ID');
		expect(humanize('sendAt')).toBe('Send At');
		expect(humanize('platformIds')).toBe('Platform IDs');
	});

	it('follow the n8n period rules', () => {
		expect(finishDescription('The account ID.')).toBe('The account ID');
		expect(finishDescription('Optional filter. Leave it out for all')).toBe('Optional filter. Leave it out for all.');
		expect(finishDescription('`x` or `linkedin`')).toBe('X or linkedin');
	});
});
