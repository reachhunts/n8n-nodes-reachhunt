import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { apiRequest } from './transport';

const SEARCH_PAGE_SIZE = 50;
const LOAD_PAGE_SIZE = 100;
const MAX_LOAD_PAGES = 10;

const PLATFORM_NAMES: Record<string, string> = { x: 'X', linkedin: 'LinkedIn' };

const isObject = (value: unknown): value is IDataObject =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const listOf = (data: unknown, key: string): IDataObject[] => {
	const value = key ? (isObject(data) ? data[key] : undefined) : data;
	return Array.isArray(value) ? value.filter(isObject) : [];
};

const byName = (a: INodePropertyOptions, b: INodePropertyOptions) => a.name.localeCompare(b.name);

const matching = (items: INodeListSearchItems[], filter?: string): INodeListSearchItems[] => {
	const needle = filter?.trim().toLowerCase();
	return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
};

const toOption = ({ name, value }: INodeListSearchItems): INodePropertyOptions => ({ name, value });

async function accountItems(this: ILoadOptionsFunctions): Promise<INodeListSearchItems[]> {
	const accounts = listOf(await apiRequest.call(this, 'GET', '/accounts'), '');
	return accounts.map((account) => {
		const profile = isObject(account.profile) ? account.profile : {};
		const name = String(profile.name || account.handle || account.id);
		const platform = PLATFORM_NAMES[String(account.platform)] ?? String(account.platform);
		return {
			name: `${name} · ${platform}`,
			value: String(account.id),
			...(typeof profile.url === 'string' ? { url: profile.url } : {}),
		};
	});
}

async function keyedItems(
	this: ILoadOptionsFunctions,
	path: string,
	key: string,
	label: string,
): Promise<INodeListSearchItems[]> {
	return listOf(await apiRequest.call(this, 'GET', path), key).map((item) => ({
		name: String(item[label] ?? item.id),
		value: String(item.id),
	}));
}

async function searchPaged(
	this: ILoadOptionsFunctions,
	path: string,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = Number(paginationToken) || 1;
	const data = await apiRequest.call(this, 'GET', path, {
		qs: { page, limit: SEARCH_PAGE_SIZE, ...(filter ? { search: filter } : {}) },
	});
	const totalPages = Number((isObject(data) && data.totalPages) || page);
	return {
		results: listOf(data, 'items').map((item) => ({
			name: String(item.name ?? item.id),
			value: String(item.id),
		})),
		...(page < totalPages ? { paginationToken: String(page + 1) } : {}),
	};
}

async function loadPaged(this: ILoadOptionsFunctions, path: string): Promise<INodePropertyOptions[]> {
	const options: INodePropertyOptions[] = [];
	for (let page = 1; page <= MAX_LOAD_PAGES; page++) {
		const data = await apiRequest.call(this, 'GET', path, { qs: { page, limit: LOAD_PAGE_SIZE } });
		for (const item of listOf(data, 'items')) {
			options.push({ name: String(item.name ?? item.id), value: String(item.id) });
		}
		if (page >= Number((isObject(data) && data.totalPages) || page)) break;
	}
	return options.sort(byName);
}

export const listSearch = {
	async searchAccounts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		return { results: matching(await accountItems.call(this), filter) };
	},
	async searchAgents(
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchPaged.call(this, '/agents', filter, paginationToken);
	},
	async searchCampaigns(
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchPaged.call(this, '/campaigns', filter, paginationToken);
	},
	async searchLeadLists(
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchPaged.call(this, '/leads', filter, paginationToken);
	},
	async searchMembers(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const items = await keyedItems.call(this, '/workspace/assignees', 'assignees', 'name');
		return { results: matching(items, filter) };
	},
	async searchStatuses(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		return { results: matching(await keyedItems.call(this, '/statuses', 'statuses', 'label'), filter) };
	},
	async searchTags(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		return { results: matching(await keyedItems.call(this, '/tags', 'tags', 'label'), filter) };
	},
};

export const loadOptions = {
	async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await accountItems.call(this)).map(toOption).sort(byName);
	},
	async getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return await loadPaged.call(this, '/agents');
	},
	async getCampaigns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return await loadPaged.call(this, '/campaigns');
	},
	async getLeadLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return await loadPaged.call(this, '/leads');
	},
	async getMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await keyedItems.call(this, '/workspace/assignees', 'assignees', 'name')).map(toOption).sort(byName);
	},
	async getStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await keyedItems.call(this, '/statuses', 'statuses', 'label')).map(toOption).sort(byName);
	},
	async getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await keyedItems.call(this, '/tags', 'tags', 'label')).map(toOption).sort(byName);
	},
};
