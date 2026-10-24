import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { runOperation } from './execute';
import { properties } from './generated/properties';
import { listSearch, loadOptions } from './methods';

export class ReachHunt implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ReachHunt',
		name: 'reachHunt',
		icon: 'file:reachhunt.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Run DM outreach on X and LinkedIn with ReachHunt',
		defaults: {
			name: 'ReachHunt',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'reachHuntApi',
				required: true,
			},
		],
		properties,
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const results = await runOperation.call(this, resource, operation, itemIndex);
				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(results), {
						itemData: { item: itemIndex },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
