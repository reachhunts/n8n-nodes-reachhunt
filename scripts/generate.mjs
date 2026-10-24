import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import * as defaultCatalog from './catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = resolve(ROOT, 'spec/openapi.json');
const OUTPUT = {
	properties: 'nodes/ReachHunt/generated/properties.ts',
	operations: 'nodes/ReachHunt/generated/operations.ts',
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const PAGING_PARAMS = new Set(['page', 'limit', 'cursor']);
const SENSITIVE_NAMES = ['secret', 'password', 'token', 'apikey'];
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);
const WORD_FIXES = { Id: 'ID', Ids: 'IDs', Url: 'URL', Csv: 'CSV', Ai: 'AI', Linkedin: 'LinkedIn' };
const EXPRESSION_LINK = '<a href="https://docs.n8n.io/code/expressions/">expression</a>';
const DYNAMIC_ONE = `Choose from the list, or specify an ID using an ${EXPRESSION_LINK}`;
const DYNAMIC_MANY = `Choose from the list, or specify IDs using an ${EXPRESSION_LINK}`;
const COLLECTIONS = {
	filters: { displayName: 'Filters', placeholder: 'Add Filter' },
	additionalFields: { displayName: 'Additional Fields', placeholder: 'Add Field' },
	updateFields: { displayName: 'Update Fields', placeholder: 'Add Field' },
	options: { displayName: 'Options', placeholder: 'Add Option' },
};
const SIMPLE_TYPES = {
	string: { type: 'string', default: '' },
	text: { type: 'string', default: '' },
	list: { type: 'string', default: '' },
	number: { type: 'number', default: 0 },
	boolean: { type: 'boolean', default: false },
	dateTime: { type: 'dateTime', default: '' },
	color: { type: 'color', default: '#8b5cf6' },
	json: { type: 'json', default: '{}' },
};

const byName = (a, b) => a.name.localeCompare(b.name);
const byDisplayName = (a, b) => a.displayName.localeCompare(b.displayName);
const sortIfLong = (items, compare) => (items.length >= 5 ? [...items].sort(compare) : items);

const typesOf = (schema) => [schema?.type ?? []].flat();
const hasType = (schema, type) => typesOf(schema).includes(type);
const isNullable = (schema) => hasType(schema, 'null') || schema?.nullable === true;

export function humanize(name) {
	return name
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(' ')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.map((word) => WORD_FIXES[word] ?? word)
		.map((word, index, words) =>
			index > 0 && index < words.length - 1 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word,
		)
		.join(' ');
}

const sameText = (a, b) => {
	const normalize = (text) =>
		(text ?? '')
			.toLowerCase()
			.replace(/^the\s+/, '')
			.replace(/\.$/, '')
			.trim();
	return normalize(a) === normalize(b);
};

export function finishDescription(text) {
	let value = (text ?? '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
	if (!value) return '';
	value = value.charAt(0).toUpperCase() + value.slice(1);
	value = value
		.replace(/\bid\b/g, 'ID')
		.replace(/\bids\b/g, 'IDs')
		.replace(/\burl\b/gi, 'URL')
		.replace(/\bjson\b/gi, 'JSON');
	const sentences = value.replace('e.g.', '').split('. ').length;
	if (sentences === 1 && value.endsWith('.')) value = value.slice(0, -1);
	if (sentences > 1 && !value.endsWith('.')) value += '.';
	return value;
}

const joinSentences = (...parts) =>
	parts
		.map((part) => (part ?? '').trim().replace(/\.$/, ''))
		.filter(Boolean)
		.join('. ');

const firstParagraph = (text) =>
	(text ?? '')
		.split(/\n\s*\n|\n\s*-\s/)[0]
		.replace(/^\s*Optional\.\s*/, '')
		.trim();

function bulletDescriptions(text) {
	const out = {};
	for (const match of (text ?? '').matchAll(/^\s*-\s*`([^`]+)`:\s*(.+)$/gm)) out[match[1]] = match[2].trim();
	return out;
}

function createResolver(spec) {
	const schemas = spec.components?.schemas ?? {};
	const resolveRef = (value, seen = new Set()) => {
		if (Array.isArray(value)) return value.map((item) => resolveRef(item, seen));
		if (!value || typeof value !== 'object') return value;
		if (typeof value.$ref === 'string') {
			const name = value.$ref.split('/').pop();
			if (seen.has(name) || !schemas[name]) return { type: 'object' };
			return resolveRef(schemas[name], new Set([...seen, name]));
		}
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveRef(child, seen)]));
	};
	return resolveRef;
}

function findOperation(spec, id) {
	for (const [path, item] of Object.entries(spec.paths)) {
		for (const method of METHODS) {
			if (item[method]?.operationId === id) return { path, method: method.toUpperCase(), operation: item[method] };
		}
	}
	throw new Error(`Operation ${id} is not in the OpenAPI spec`);
}

function responseShape(dataSchema, method, queryParams) {
	if (!dataSchema) return {};
	const paging = queryParams.has('cursor') ? 'cursor' : queryParams.has('page') ? 'page' : undefined;
	const properties = dataSchema.properties ?? {};
	const keys = Object.keys(properties);
	let key;
	if (hasType(dataSchema, 'array')) key = '';
	else if (hasType(properties.items, 'array')) key = 'items';
	else if (keys.length === 1 && hasType(properties[keys[0]], 'array')) key = keys[0];
	if (key !== undefined && (method === 'GET' || paging)) return { list: { key, ...(paging ? { paging } : {}) } };
	if (key) return { unwrap: key };
	if (keys.length === 1 && hasType(properties[keys[0]], 'object')) return { unwrap: keys[0] };
	return {};
}

function kindOf(schema, config, top) {
	if (config.source) return hasType(schema, 'array') ? 'dynamicMulti' : top ? 'locator' : 'dynamic';
	if (config.kind) return config.kind;
	if (hasType(schema, 'array')) {
		if (config.enum || schema.items?.enum) return 'multiOptions';
		return hasType(schema.items, 'object') ? 'json' : 'list';
	}
	if (config.enum || schema.enum) return 'options';
	if (hasType(schema, 'boolean')) return 'boolean';
	if (hasType(schema, 'integer') || hasType(schema, 'number')) return 'number';
	if (hasType(schema, 'object')) return 'json';
	if (schema.format === 'date-time') return 'dateTime';
	return 'string';
}

function displayNameOf(catalog, apiName, config, kind) {
	if (!config.source) return config.displayName ?? humanize(apiName);
	const base = config.label ?? catalog.SOURCES[config.source].label;
	if (kind === 'dynamic') return `${base} Name or ID`;
	if (kind === 'dynamicMulti') return `${base} Names or IDs`;
	return base;
}

function enumOptions(catalog, values, field, operationId) {
	const custom = catalog.ENUM_DESCRIPTIONS[`${operationId}.${field.apiName}`] ?? {};
	const bullets = bulletDescriptions(field.specDescription);
	const options = values.map((value) => {
		const option = { name: catalog.ENUM_NAMES[value] ?? humanize(value), value };
		const description = finishDescription(custom[value] ?? bullets[value]);
		if (description && description !== option.name) option.description = description;
		return option;
	});
	return sortIfLong(options, byName);
}

function buildParameter(catalog, field, operationId) {
	const { kind, config, schema } = field;
	const parameter = { displayName: field.displayName, name: field.param };
	const required = field.required ? { required: true } : {};
	const describe = (extra) => finishDescription(joinSentences(field.description, extra));
	const source = config.source ? catalog.SOURCES[config.source] : undefined;

	if (kind === 'locator') {
		Object.assign(parameter, {
			type: 'resourceLocator',
			...required,
			default: { mode: 'list', value: '' },
			description: describe(),
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: source.search, searchable: true },
				},
				{ displayName: 'By ID', name: 'id', type: 'string', placeholder: 'e.g. 4e6a8c0b-2d4f-4a6c-8e0b-3d5f7a9c1e2b' },
			],
		});
	} else if (kind === 'dynamic' || kind === 'dynamicMulti') {
		const multi = kind === 'dynamicMulti';
		Object.assign(parameter, {
			type: multi ? 'multiOptions' : 'options',
			typeOptions: { loadOptionsMethod: source.load },
			...required,
			default: multi ? [] : '',
			description: describe(multi ? DYNAMIC_MANY : DYNAMIC_ONE),
		});
	} else if (kind === 'options' || kind === 'multiOptions') {
		const multi = kind === 'multiOptions';
		const options = enumOptions(catalog, config.enum ?? (multi ? schema.items.enum : schema.enum), field, operationId);
		Object.assign(parameter, {
			type: kind,
			...required,
			options,
			default: multi ? [] : (config.default ?? options[0].value),
			description: describe(),
		});
	} else if (kind === 'texts') {
		Object.assign(parameter, {
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Variant',
			default: {},
			description: describe(),
			options: [
				{
					displayName: 'Variant',
					name: 'values',
					values: [{ displayName: 'Text', name: 'text', type: 'string', typeOptions: { rows: 3 }, default: '' }],
				},
			],
		});
	} else {
		const simple = SIMPLE_TYPES[kind];
		const fallback = kind === 'json' && hasType(schema, 'array') ? '[]' : simple.default;
		const listHint = kind === 'list' && !/comma/i.test(field.description ?? '') ? 'Separate several with commas' : '';
		Object.assign(parameter, {
			type: simple.type,
			...required,
			default: config.default ?? fallback,
			...(config.placeholder ? { placeholder: config.placeholder } : {}),
			description: describe(listHint),
		});
		const typeOptions = {
			...(kind === 'text' ? { rows: 4 } : {}),
			...(SENSITIVE_NAMES.some((name) => field.apiName.toLowerCase().includes(name)) ? { password: true } : {}),
		};
		if (Object.keys(typeOptions).length) parameter.typeOptions = typeOptions;
	}
	if (!parameter.description || sameText(parameter.description, parameter.displayName)) delete parameter.description;
	return parameter;
}

function withDisplayOptions(parameter, displayOptions) {
	const out = {};
	for (const [key, value] of Object.entries(parameter)) {
		out[key] = value;
		if (key === 'default') out.displayOptions = displayOptions;
	}
	return out;
}

function collectFields(spec, resolveRef, entry) {
	const found = findOperation(spec, entry.id);
	const { operation } = found;
	const fields = [];
	const queryParams = new Set();
	for (const raw of operation.parameters ?? []) {
		const parameter = resolveRef(raw);
		if (parameter.in === 'query') queryParams.add(parameter.name);
		if (parameter.in !== 'path' && parameter.in !== 'query') continue;
		if (parameter.in === 'query' && PAGING_PARAMS.has(parameter.name)) continue;
		fields.push({
			apiName: parameter.name,
			in: parameter.in,
			schema: resolveRef(parameter.schema ?? { type: 'string' }),
			required: parameter.in === 'path' || !!parameter.required,
			specDescription: parameter.description,
		});
	}
	const body = operation.requestBody?.content?.['application/json']?.schema;
	if (body) {
		const resolved = resolveRef(body);
		const required = new Set(resolved.required ?? []);
		for (const [name, schema] of Object.entries(resolved.properties ?? {})) {
			fields.push({ apiName: name, in: 'body', schema, required: required.has(name), specDescription: schema.description });
		}
	}
	const response = operation.responses?.['200'] ?? operation.responses?.['201'];
	const envelope = resolveRef(response?.content?.['application/json']?.schema ?? {});
	const shape = responseShape(resolveRef(envelope.properties?.data ?? null), found.method, queryParams);
	return { ...found, fields, shape };
}

function groupFor(entry, shape) {
	if (entry.collection) return entry.collection;
	if (entry.value === 'update') return 'updateFields';
	if (entry.value === 'create') return 'additionalFields';
	return shape.list ? 'filters' : 'options';
}

export function buildNode(spec, catalog = defaultCatalog) {
	const resolveRef = createResolver(spec);
	const properties = [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: [...catalog.RESOURCES].sort(byName).map(({ name, value }) => ({ name, value })),
			default: catalog.DEFAULT_RESOURCE,
		},
	];
	const operations = {};
	const topLevelTypes = new Map();

	for (const resource of catalog.RESOURCES) {
		const entries = catalog.OPERATIONS.filter((entry) => entry.resource === resource.value);
		properties.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource.value] } },
			options: sortIfLong(
				entries.map(({ name, value, description, action }) => ({ name, value, description, action })),
				byName,
			),
			default: resource.defaultOperation,
		});

		for (const entry of entries) {
			const key = `${entry.resource}:${entry.value}`;
			if (operations[key]) throw new Error(`Duplicate operation ${key}`);
			const { method, path, fields: rawFields, shape } = collectFields(spec, resolveRef, entry);
			const group = groupFor(entry, shape);
			const show = { show: { resource: [entry.resource], operation: [entry.value] } };

			const fields = rawFields.map((raw) => {
				const config = { ...(catalog.FIELDS[raw.apiName] ?? {}), ...(entry.fields?.[raw.apiName] ?? {}) };
				const required = config.required ?? raw.required;
				const top = raw.in === 'path' || (config.top ?? required);
				const nullable = isNullable(raw.schema);
				const kind = kindOf(raw.schema, config, top);
				return {
					...raw,
					param: config.param ?? raw.apiName,
					config,
					kind,
					top,
					nullable,
					required: raw.in === 'path' || (required && !nullable),
					displayName: displayNameOf(catalog, raw.apiName, config, kind),
					description: config.description ?? firstParagraph(raw.specDescription),
				};
			});
			const unknown = Object.keys(entry.fields ?? {}).filter((name) => !rawFields.some((raw) => raw.apiName === name));
			if (unknown.length) throw new Error(`${entry.id}: catalog fields not in the spec: ${unknown.join(', ')}`);

			const priority = (field) => (field.apiName === 'accountId' ? 0 : field.in === 'path' ? 1 : 2);
			const topFields = fields.filter((item) => item.top).sort((a, b) => priority(a) - priority(b));
			const grouped = fields.filter((field) => !field.top);
			for (const field of topFields) {
				const parameter = buildParameter(catalog, field, entry.id);
				const previous = topLevelTypes.get(parameter.name);
				if (previous && previous !== parameter.type) {
					throw new Error(`${entry.id}: ${parameter.name} is ${parameter.type} here but ${previous} elsewhere`);
				}
				topLevelTypes.set(parameter.name, parameter.type);
				properties.push(withDisplayOptions(parameter, show));
			}

			if (shape.list) {
				properties.push(
					{
						displayName: 'Return All',
						name: 'returnAll',
						type: 'boolean',
						default: false,
						displayOptions: show,
						description: 'Whether to return all results or only up to a given limit',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 50,
						displayOptions: { show: { ...show.show, returnAll: [false] } },
						description: 'Max number of results to return',
					},
				);
			}

			if (grouped.length) {
				properties.push({
					displayName: COLLECTIONS[group].displayName,
					name: group,
					type: 'collection',
					placeholder: COLLECTIONS[group].placeholder,
					default: {},
					displayOptions: show,
					options: grouped.map((field) => buildParameter(catalog, field, entry.id)).sort(byDisplayName),
				});
			}

			operations[key] = {
				method,
				path,
				fields: [...topFields, ...grouped].map((field) => ({
					name: field.apiName,
					...(field.param !== field.apiName ? { param: field.param } : {}),
					in: field.in,
					kind: field.kind,
					label: field.displayName.replace(/ Names? or IDs?$/, ''),
					...(field.top ? {} : { group }),
					...(field.required ? { required: true } : {}),
					...(field.nullable ? { nullable: true } : {}),
				})),
				...shape,
			};
		}
	}
	return { properties, operations };
}

export async function render(spec, catalog = defaultCatalog) {
	const { properties, operations } = buildNode(spec, catalog);
	const config = await prettier.resolveConfig(resolve(ROOT, OUTPUT.properties));
	const format = (source) => prettier.format(source, { ...config, parser: 'typescript' });
	const json = (value) => JSON.stringify(value);
	return {
		[OUTPUT.properties]: await format(
			`import type { INodeProperties } from 'n8n-workflow';\n\nexport const properties: INodeProperties[] = ${json(properties)};\n`,
		),
		[OUTPUT.operations]: await format(
			`import type { OperationSpec } from '../types';\n\nexport const operations: Record<string, OperationSpec> = ${json(operations)};\n`,
		),
	};
}

export const readSpec = () => JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

export const outputPath = (path) => resolve(ROOT, path);

export const readOutput = (path) => readFileSync(outputPath(path), 'utf8');

async function main() {
	const files = await render(readSpec());
	const check = process.argv.includes('--check');
	let stale = false;
	for (const [path, content] of Object.entries(files)) {
		if (!check) {
			writeFileSync(outputPath(path), content);
			console.log(`Wrote ${path}`);
			continue;
		}
		let current = '';
		try {
			current = readFileSync(outputPath(path), 'utf8');
		} catch {
			current = '';
		}
		if (current !== content) {
			stale = true;
			console.error(`${path} is out of date. Run npm run generate.`);
		}
	}
	if (stale) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
