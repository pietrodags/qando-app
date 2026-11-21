# MCP prototype (throwaway branch, never merged as is)

An assistant reaches an organizer's events through `/api/mcp`, with access the organizer grants
by OAuth 2.1 on qando's own sign-in. Everything marked `PROTOTYPE` in the code belongs to it.

## Running it

A database of its own, the local mailbox (no real email), the API and the web dev server, which
also forwards the two discovery paths (`apps/web/proxy.spike.conf.json`):

```sh
createdb -h localhost qando_mcp_spike
DATABASE_URL=postgres://$(whoami)@localhost:5432/qando_mcp_spike npm run db:migrate --workspace @qando/api
npx tsx e2e/mailbox/server.ts                                   # SMTP 2525, read at http://127.0.0.1:2526/emails?to=<email>
tools/mcp-spike/api.sh                                          # public address http://localhost:4200
(cd apps/web && npx ng serve --port 4200 --proxy-config proxy.spike.conf.json --allowed-hosts)
```

`tools/mcp-spike/api.sh <public address>` starts the API for another public address (a tunnel's);
`QANDO_SPIKE_OPEN_REGISTRATION=on` before it lets applications without a metadata document
register themselves (the scripts below need it, except with `SPIKE_CLIENT_ID`).

## Checking it

```sh
node tools/mcp-spike/flow.mjs                 # the whole way without a browser (SPIKE_WAY=b for the other way to continue after signing in)
node tools/mcp-spike/browser-flow.mjs [dir]   # the pages in a real browser
SPIKE_CLIENT_ID=https://claude.ai/oauth/claude-code-client-metadata SPIKE_CLIENT_NAME="Claude Code" \
  SPIKE_REDIRECT=http://localhost:53682/callback node tools/mcp-spike/browser-flow.mjs   # as Claude Code: its published metadata document
```

`SPIKE_BASE=<public address>` points the scripts at a tunnel.
