import type { INodeParameters, INodeProperties } from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { ReachHunt } from '../nodes/ReachHunt/ReachHunt.node';
import { ReachHuntTrigger } from '../nodes/ReachHuntTrigger/ReachHuntTrigger.node';
import { operations } from '../nodes/ReachHunt/generated/operations';
import { NODE } from './helpers';

const description = new ReachHunt().description;
const properties = description.properties as INodeProperties[];

const parametersFor = (values: INodeParameters) =>
	NodeHelpers.getNodeParameters(properties, values, true, false, NODE, description) ?? {};

const issuesFor = (parameters: INodeParameters) =>
	NodeHelpers.getNodeParametersIssues(properties, { ...NODE, parameters }, description)?.parameters ?? {};

const sampleFor = (property: INodeProperties) => {
	if (property.type === 'resourceLocator') return { __rl: true, mode: 'id', value: 'sample-id' };
	if (property.type === 'number') return 1;
	if (property.type === 'multiOptions') return ['sample-id'];
	if (property.type === 'json') return '{}';
	return 'sample';
};

describe('node description in n8n', () => {
	it.each(Object.keys(operations))('%s shows its fields and validates once filled', (key) => {
		const [resource, operation] = key.split(':');
		const parameters = parametersFor({ resource, operation });
		expect(parameters.resource).toBe(resource);
		expect(parameters.operation).toBe(operation);

		const spec = operations[key];
		for (const field of spec.fields) {
			expect(parameters, `${key}: ${field.group ?? field.param ?? field.name} is not shown`).toHaveProperty(
				field.group ?? field.param ?? field.name,
			);
		}
		if (spec.list) expect(parameters).toHaveProperty('returnAll', false);

		const missing = Object.keys(issuesFor(parameters));
		const required = spec.fields.filter((field) => field.required && !field.group).map((field) => field.param ?? field.name);
		for (const name of missing) expect(required, `${key}: ${name} is flagged but not required`).toContain(name);

		const filled = { ...parameters };
		for (const name of missing) {
			const property = properties.find(
				(item) => item.name === name && NodeHelpers.displayParameter(parameters, item, NODE, description),
			);
			filled[name] = sampleFor(property as INodeProperties);
		}
		expect(issuesFor(filled)).toEqual({});
	});

	it('gives the trigger its webhook and a required event list', () => {
		const trigger = new ReachHuntTrigger().description;
		expect(trigger.webhooks?.[0]).toMatchObject({ name: 'default', httpMethod: 'POST', path: 'webhook' });
		expect(trigger.inputs).toEqual([]);
		const parameters = NodeHelpers.getNodeParameters(trigger.properties, {}, true, false, NODE, trigger) ?? {};
		const issues = NodeHelpers.getNodeParametersIssues(trigger.properties, { ...NODE, parameters }, trigger);
		expect(Object.keys(issues?.parameters ?? {})).toEqual(['events']);
	});
});
