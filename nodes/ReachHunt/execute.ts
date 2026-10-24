import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { toIsoInZone } from './dates';
import { operations } from './generated/operations';
import { apiRequest } from './transport';
import type { FieldSpec, OperationSpec } from './types';

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const SKIP = Symbol('skip');

type Value = IDataObject[string];

interface Request {
	path: string;
	qs: IDataObject;
	body: IDataObject;
}

const isObject = (value: unknown): value is IDataObject =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const hasKeys = (value: IDataObject) => Object.keys(value).length > 0;

const itemsOf = (data: unknown, key: string): IDataObject[] => {
	const value = key ? (isObject(data) ? data[key] : undefined) : data;
	return Array.isArray(value) ? value.filter(isObject) : [];
};

const toItems = (value: unknown): IDataObject[] => {
	if (value === null || value === undefined) return [{ success: true }];
	if (Array.isArray(value)) return value.map((item) => (isObject(item) ? item : { value: item as Value }));
	return [isObject(value) ? value : { value: value as Value }];
};

const splitList = (raw: unknown): string[] =>
	(Array.isArray(raw) ? raw : String(raw).split(','))
		.map((item) => String(item).trim())
		.filter(Boolean);

function convert(
	this: IExecuteFunctions,
	field: FieldSpec,
	raw: unknown,
	itemIndex: number,
): Value | typeof SKIP {
	const empty = () => (field.nullable ? null : SKIP);
	if (raw === undefined || raw === null) return empty();

	switch (field.kind) {
		case 'boolean':
			return raw === true || raw === 'true';
		case 'number': {
			if (raw === '') return empty();
			const number = Number(raw);
			if (Number.isNaN(number)) {
				throw new NodeOperationError(this.getNode(), `${field.label} must be a number`, { itemIndex });
			}
			return number;
		}
		case 'list':
		case 'multiOptions':
		case 'dynamicMulti': {
			const values = splitList(raw);
			return values.length || field.required ? values : SKIP;
		}
		case 'texts': {
			const rows = isObject(raw) && Array.isArray(raw.values) ? (raw.values as IDataObject[]) : [];
			const values = rows.map((row) => String(row.text ?? '')).filter((text) => text.trim());
			return values.length ? values : SKIP;
		}
		case 'json': {
			if (typeof raw !== 'string') return raw as Value;
			if (!raw.trim()) return empty();
			try {
				return JSON.parse(raw) as Value;
			} catch {
				throw new NodeOperationError(this.getNode(), `${field.label} must be valid JSON`, { itemIndex });
			}
		}
		case 'dateTime': {
			const text = String(raw).trim();
			if (!text) return empty();
			try {
				return toIsoInZone(text, this.getTimezone());
			} catch (error) {
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex,
					message: `${field.label} must be a valid date`,
				});
			}
		}
		default: {
			if (typeof raw === 'object') return raw as Value;
			const text = String(raw);
			if (!text.trim()) return empty();
			return field.kind === 'text' ? text : text.trim();
		}
	}
}

function buildRequest(this: IExecuteFunctions, spec: OperationSpec, itemIndex: number): Request {
	const request: Request = { path: spec.path, qs: {}, body: {} };
	const groups: Record<string, IDataObject> = {};

	for (const field of spec.fields) {
		const param = field.param ?? field.name;
		let raw: unknown;
		if (field.group) {
			groups[field.group] ??= this.getNodeParameter(field.group, itemIndex, {}) as IDataObject;
			if (!(param in groups[field.group])) continue;
			raw = groups[field.group][param];
		} else {
			raw = this.getNodeParameter(
				param,
				itemIndex,
				undefined,
				field.kind === 'locator' ? { extractValue: true } : undefined,
			);
		}

		const value = convert.call(this, field, raw, itemIndex);
		if (value === SKIP) {
			if (field.required) {
				throw new NodeOperationError(this.getNode(), `${field.label} is required`, { itemIndex });
			}
			continue;
		}
		if (field.in === 'path') {
			request.path = request.path.replace(`{${field.name}}`, encodeURIComponent(String(value)));
		} else if (field.in === 'query') {
			request.qs[field.name] = value;
		} else {
			request.body[field.name] = value;
		}
	}
	return request;
}

async function collect(
	this: IExecuteFunctions,
	spec: OperationSpec,
	request: Request,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { key, paging } = spec.list ?? { key: '' };
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex, 50) as number);
	const body = hasKeys(request.body) ? request.body : undefined;
	const fetchPage = async (qs: IDataObject) =>
		await apiRequest.call(this, spec.method, request.path, {
			qs: { ...request.qs, ...qs },
			body,
			itemIndex,
		});
	const results: IDataObject[] = [];

	if (paging === 'page') {
		const size = Math.min(limit, PAGE_SIZE);
		for (let page = 1; page <= MAX_PAGES; page++) {
			const data = await fetchPage({ page, limit: size });
			const items = itemsOf(data, key);
			results.push(...items);
			const totalPages = Number((isObject(data) && data.totalPages) || page);
			if (results.length >= limit || !items.length || page >= totalPages) break;
		}
	} else if (paging === 'cursor') {
		let cursor: string | undefined;
		for (let page = 1; page <= MAX_PAGES; page++) {
			const size = Math.min(limit - results.length, PAGE_SIZE);
			const data = await fetchPage({ limit: size, ...(cursor ? { cursor } : {}) });
			const items = itemsOf(data, key);
			results.push(...items);
			cursor = isObject(data) && typeof data.nextCursor === 'string' ? data.nextCursor : undefined;
			if (results.length >= limit || !items.length || !cursor) break;
		}
	} else {
		results.push(...itemsOf(await fetchPage({}), key));
	}
	return returnAll ? results : results.slice(0, limit);
}

export async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const spec = operations[`${resource}:${operation}`];
	if (!spec) {
		throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
			itemIndex,
		});
	}
	const request = buildRequest.call(this, spec, itemIndex);
	if (spec.list) return await collect.call(this, spec, request, itemIndex);

	const data = await apiRequest.call(this, spec.method, request.path, {
		qs: request.qs,
		body: hasKeys(request.body) ? request.body : undefined,
		itemIndex,
	});
	const unwrapped = spec.unwrap && isObject(data) && spec.unwrap in data ? data[spec.unwrap] : data;
	return toItems(unwrapped);
}
