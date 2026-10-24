# n8n-nodes-reachhunt

[n8n](https://n8n.io/) community node for [ReachHunt](https://reachhunt.ai), DM outreach on X and LinkedIn.

Run campaigns, reply from one inbox and manage your leads directly from n8n workflows.

![ReachHunt + n8n](https://img.shields.io/badge/ReachHunt-n8n-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

This node uses the [ReachHunt API](https://docs.reachhunt.ai/developer-api/introduction).

## Platform Support

Every resource works on X and LinkedIn. Accounts from both networks show up in the same lists. Connection requests, InMails and message requests are LinkedIn only.

## What You Can Do

### 💬 Send & Manage DMs
- **Send direct messages** from your connected X and LinkedIn accounts, and react to messages
- **Find or start a conversation** with a lead or any profile
- **Schedule messages** for later, or cancel them
- **List conversations**, mark them as read or unread, and close or reopen them
- **Answer LinkedIn message requests**

### 🚀 Run Campaigns
- **Create and update campaigns** with message, wait, connection request and InMail steps
- **Start, pause, resume and stop** campaigns
- **See the targets and activity** of each campaign

### 👥 Manage Leads
- **Build lead lists**: add leads, copy them between lists, and import them from X followers, post likes, LinkedIn searches, CSV and more
- **Search leads**, find people and look up an X profile
- **Update leads**: tags, status, note and deal value
- **Assign conversations** to teammates and leave internal notes

### 🤖 AI Agents
- **Pause and resume agents**, assign accounts to them, and set how each conversation is handled

### 🏷️ Organize with Tags, Statuses & Templates
- **Create tags and statuses** to build your own pipeline stages
- **Save message templates** to reuse in campaigns and replies

### 👤 Workspace & Accounts
- **List connected accounts** and check their sending limits
- **See the activity summary** and your remaining credits

### ⚡ Trigger
- **Start a workflow on 42 events**: replies, new messages, status changes, campaign progress, disconnected accounts and more

## Getting Started

### 1. Get Your API Key

1. Log in to [ReachHunt](https://app.reachhunt.ai)
2. Go to **Settings → API**
3. Create an API key

### 2. Install the Node

In your n8n instance, go to **Settings → Community Nodes** and install:

```
@reachhunt/n8n-nodes-reachhunt
```

Or install manually:

```bash
cd ~/.n8n/nodes
npm install @reachhunt/n8n-nodes-reachhunt
```

### 3. Add Your Credentials

1. In n8n, go to **Credentials → Add Credential**
2. Search for **ReachHunt API**
3. Paste your API key
4. Keep **Base URL** as it is and save

### 4. Build Your First Workflow

Here are some common workflows to get you started:

#### Get a Slack Alert When a Lead Replies

```
ReachHunt Trigger (Campaign Lead Replied) → Slack (Send Message)
```

#### Tag Conversations Based on Keywords

```
ReachHunt Trigger (Message Received) → IF (keyword match) → ReachHunt (Conversation Add Tag)
```

#### Import Leads from Google Sheets

```
Google Sheets Trigger → ReachHunt (Lead List Start Import)
```

Set **Source** to **Plain Text** and map the X handles or LinkedIn profile URLs from your sheet into **Content**.

#### Send a DM When a Lead's Status Changes

```
ReachHunt Trigger (Lead Status Changed) → ReachHunt (Conversation Find or Start) → ReachHunt (Message Send)
```

## Available Operations

| Resource | Operations |
|----------|-----------|
| **Account** | Get Many, Get Limits |
| **AI Agent** | Get, Get Many, Pause, Resume, Assign Account, Unassign Account, Set Conversation Mode |
| **Campaign** | Create, Get, Get Many, Update, Start, Pause, Resume, Stop, Get Targets, Get Activity |
| **Conversation** | Get, Get Many, Find or Start, Get Profile, Mark as Read, Mark as Unread, Close, Reopen, Add Tag, Remove Tag, Set Status, Set Assignee, Set Note, Set Deal Value |
| **Internal Note** | Create, Get Many |
| **Lead** | Search, Find People, Look Up X Profile, Update Tags, Set Status, Set Note, Set Deal Value |
| **Lead List** | Create, Get, Get Many, Get Leads, Add Leads, Copy Leads, Start Import, Stop Import, Get Imports |
| **Message** | Send, Get Many, React |
| **Request** | Get Many, Answer |
| **Scheduled Message** | Create, Get Many, Cancel |
| **Status** | Create, Get Many |
| **Tag** | Create, Get Many |
| **Template** | Create, Get Many |
| **Workspace** | Get Activity Summary, Get Credits |

List operations return everything with **Return All**, or up to **Limit** items (50 by default). Accounts, lead lists, campaigns, AI agents, tags, statuses and teammates can be picked from a searchable list.

Actions that send messages, react, answer requests or start campaigns reach real people from your connected accounts.

## Trigger

The **ReachHunt Trigger** starts a workflow when something happens in ReachHunt. When you activate the workflow, it creates a webhook in ReachHunt, and it deletes the webhook when you deactivate the workflow. It checks the signature of every delivery.

| Group | Events |
|-------|--------|
| **Messages** | Received, Sent, Seen, Edited, Deleted, Reaction Added, Reaction Removed |
| **Conversations** | Created, Deleted, Archived, Unarchived |
| **Leads** | Added to List, Status Changed, Tag Added, Tag Removed, Note Changed, Valuation Changed, Assignee Changed |
| **Campaigns** | Created, Started, Paused, Resumed, Completed, Stopped |
| **Campaign Leads** | Contacted, Follow-up Sent, Replied, Failed, Connection Request Sent, Connection Request Accepted, Connection Request Withdrawn |
| **Accounts** | Connected, Disconnected |
| **Imports** | Completed, Paused, Failed |
| **Tags & Statuses** | Created, Updated, Deleted |

ReachHunt sends events only to a public `https://` address. On n8n Cloud there is nothing to set up. On a self-hosted n8n behind a proxy, set `WEBHOOK_URL`.

## Example: Reply Handling Workflow

A complete reply handling workflow might look like:

1. **ReachHunt Trigger** — Campaign Lead Replied
2. **ReachHunt: Conversation Set Status** — Move the lead to "Interested"
3. **ReachHunt: Conversation Set Assignee** — Hand the conversation to a teammate
4. **Slack** — Tell the teammate who replied
5. **HubSpot** — Create a deal for the lead

Every reply becomes a tracked deal with an owner, without anyone checking the inbox by hand.

## API Docs

Full API documentation: [docs.reachhunt.ai](https://docs.reachhunt.ai/developer-api/introduction)

## Links

- 🌐 [ReachHunt](https://reachhunt.ai)
- 📖 [API Documentation](https://docs.reachhunt.ai/developer-api/introduction)
- 🐛 [Report Issues](https://github.com/reachhunts/n8n-nodes-reachhunt/issues)
- 💬 [n8n Community](https://community.n8n.io/)

## License

[MIT](LICENSE.md)
