# ReachHunt nodes for n8n

This is an n8n community node package for [ReachHunt](https://reachhunt.ai). ReachHunt runs DM outreach on X and LinkedIn: campaigns, an AI agent that replies, and one inbox for every connected account.

- **ReachHunt** runs 67 actions on 14 resources: accounts, conversations, messages, leads, lead lists, campaigns, AI agents, tags, statuses and more. The n8n AI Agent can use it as a tool.
- **ReachHunt Trigger** starts a workflow when something happens in ReachHunt, for example a lead replies, a campaign finishes or an account gets disconnected.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Usage](#usage) · [Compatibility](#compatibility) · [Development](#development) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. In short: open **Settings → Community nodes → Install** and enter `@reachhunt/n8n-nodes-reachhunt`.

## Credentials

1. In ReachHunt, open **Settings → API** and create an API key.
2. In n8n, create a **ReachHunt API** credential and paste the key.
3. Keep **Base URL** at `https://api.reachhunt.ai/api/v1`. Change it only to test against your own copy of the ReachHunt API.

The key acts for the whole workspace, so keep it private. You can revoke it in ReachHunt at any time.

## Operations

| Resource | Operations |
| --- | --- |
| Account | Get Many, Get Limits |
| AI Agent | Get, Get Many, Pause, Resume, Assign Account, Unassign Account, Set Conversation Mode |
| Campaign | Create, Get, Get Many, Update, Start, Pause, Resume, Stop, Get Targets, Get Activity |
| Conversation | Get, Get Many, Find or Start, Get Profile, Mark as Read, Mark as Unread, Close, Reopen, Add Tag, Remove Tag, Set Status, Set Assignee, Set Note, Set Deal Value |
| Internal Note | Create, Get Many |
| Lead | Search, Find People, Look Up X Profile, Update Tags, Set Status, Set Note, Set Deal Value |
| Lead List | Create, Get, Get Many, Get Leads, Add Leads, Copy Leads, Start Import, Stop Import, Get Imports |
| Message | Send, Get Many, React |
| Request | Get Many, Answer |
| Scheduled Message | Create, Get Many, Cancel |
| Status | Create, Get Many |
| Tag | Create, Get Many |
| Template | Create, Get Many |
| Workspace | Get Activity Summary, Get Credits |

Actions that send messages, react, answer requests or start campaigns reach real people from your connected accounts.

## Trigger

Pick one or more events. When you activate the workflow, the node creates a webhook in ReachHunt named `n8n: <workflow name>`. You can see it under **Settings → Webhooks**. When you deactivate the workflow, the node deletes it.

- **Events**: messages (received, sent, seen, edited, deleted, reactions), conversations (created, deleted, archived, unarchived), leads (added to a list, status, tag, note, value and assignee changes), campaigns (created, started, paused, resumed, completed, stopped), campaign leads (contacted, follow-up sent, replied, failed, connection request sent, accepted or withdrawn), accounts (connected, disconnected), imports (completed, paused, failed), tags and statuses (created, updated, deleted). The list comes from ReachHunt, so new events show up without a node update.
- **Output**: the event as ReachHunt sends it: `id`, `type`, `apiVersion`, `createdAt`, `workspaceId` and `data`.
- **Security**: every delivery must carry a valid `X-ReachHunt-Signature` header. The node checks it with the webhook secret and allows 5 minutes of clock drift. A request without a valid signature gets `401` and does not start the workflow.
- **Address**: ReachHunt sends events only to a public `https://` address. On n8n Cloud there is nothing to do. On a self-hosted n8n, make sure it is reachable over https and set `WEBHOOK_URL` if it runs behind a proxy. To try the trigger on your computer, start a tunnel such as `cloudflared tunnel --url http://localhost:5678` and start n8n with `WEBHOOK_URL` set to the tunnel address.

To send a sample event, find the webhook in **Settings → Webhooks** in ReachHunt and use **Send test event**. If you rotate its secret there, deactivate and activate the workflow so the node picks up the new one.

## Usage

- **Picking items**: accounts, lead lists, campaigns, AI agents, tags, statuses and teammates come with a searchable list. You can switch to **By ID** or use an expression instead.
- **Lists**: turn on **Return All** to page through everything, or set **Limit** (50 by default).
- **IDs from the trigger**: most conversation actions need the account and the conversation. Map them from the trigger, for example `{{ $json.data.account.id }}` and `{{ $json.data.message.conversationId }}`.
- **Dates**: **Send At** on a scheduled message uses the time zone of the workflow.
- **Clearing a value**: leave **Status** or **Assignee** empty to clear it.
- **Errors**: the node shows ReachHunt's own message, for example `Campaign not found`. With **On Error → Continue**, the error goes to the output instead of stopping the workflow.

## Compatibility

Built with `@n8n/node-cli` 0.51 and tested with `n8n-workflow` 2.42.

## Development

```bash
npm install
npm run sync:spec   # copy the ReachHunt OpenAPI spec into spec/ (default: ../../docs/openapi.json)
npm run generate    # rebuild nodes/ReachHunt/generated from spec/ and scripts/catalog.mjs
npm test
npm run lint
npm run build
npm run dev         # n8n on http://localhost:5678 with this node loaded
```

The actions are generated, not written by hand. `scripts/catalog.mjs` picks the API operations and names them, and `scripts/generate.mjs` turns them into n8n fields. To add an action, add an entry to the catalog and run `npm run generate`. The tests fail if the generated files are out of date.

Releases run with `npm run release`, which bumps the version, updates the changelog, tags and pushes. The tag starts `.github/workflows/publish.yml`, which publishes to npm with a provenance statement, as n8n verification requires.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ReachHunt](https://reachhunt.ai)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
