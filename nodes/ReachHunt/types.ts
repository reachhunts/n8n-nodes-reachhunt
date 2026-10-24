import type { IHttpRequestMethods } from 'n8n-workflow';

export type FieldKind =
	| 'string'
	| 'text'
	| 'number'
	| 'boolean'
	| 'options'
	| 'multiOptions'
	| 'dateTime'
	| 'color'
	| 'json'
	| 'list'
	| 'texts'
	| 'locator'
	| 'dynamic'
	| 'dynamicMulti';

export type FieldGroup = 'filters' | 'additionalFields' | 'updateFields' | 'options';

export interface FieldSpec {
	name: string;
	param?: string;
	in: 'path' | 'query' | 'body';
	kind: FieldKind;
	label: string;
	group?: FieldGroup;
	required?: boolean;
	nullable?: boolean;
}

export interface OperationSpec {
	method: IHttpRequestMethods;
	path: string;
	fields: FieldSpec[];
	list?: { key: string; paging?: 'page' | 'cursor' };
	unwrap?: string;
}
