import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ReachHuntApi implements ICredentialType {
	name = 'reachHuntApi';

	displayName = 'ReachHunt API';

	icon: Icon = {
		light: 'file:../nodes/ReachHunt/reachhunt.svg',
		dark: 'file:../nodes/ReachHunt/reachhunt.dark.svg',
	};

	documentationUrl = 'https://github.com/reachhunts/n8n-nodes-reachhunt#3-add-your-credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create a key in ReachHunt under Settings → API',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.reachhunt.ai/api/v1',
			description: 'Keep the default unless you run the ReachHunt API somewhere else, for example locally',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/accounts',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'status',
					value: false,
					message: 'ReachHunt did not accept this API key',
				},
			},
		],
	};
}
