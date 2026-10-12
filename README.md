# Vera dashboard

The web app for [Vera](https://github.com/joemolto/vera-engine), sales intelligence for cybersecurity vendors: your watched accounts, their signals and key people, suggested accounts, your market, an AI chat over your data, and the settings for the REST API, webhooks and MCP server.

Vera ran as a hosted product in 2026 and is now published so anyone can run it themselves. The project is complete and not actively maintained.

## What's here

- `app/`: the Next.js app (App Router). `app/dashboard/` is the product; `app/api/` holds the server routes, including the AI chat (`/api/chat`) and the MCP server (`/api/mcp`).
- `components/`, `lib/`: UI and data access. The browser reads Supabase directly, protected by row-level security.
- `supabase/functions/`: edge functions that check the signed-in user and pass requests to the engine.
- `lib/selfHosted.ts`: self-hosted mode (on by default) hides the hosted service's billing and plan screens.

## Running it

The full guide, covering Supabase, the engine, the edge functions and this app, is in the engine repo: [SETUP.md](https://github.com/joemolto/vera-engine/blob/main/SETUP.md).

In short:

```bash
npm ci
cp .env.example .env.local   # fill in the values; comments explain each one
npm run build
npm start
```

## Licence

MIT. See [LICENSE](LICENSE). Some UI is adapted from MIT-licensed projects; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
