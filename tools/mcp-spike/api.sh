#!/bin/sh
# PROTOTYPE: starts the API for the MCP prototype: its own database, every email to the local
# mailbox, and the public address given (the web dev server's by default).
cd "$(dirname "$0")/../.." || exit 1
DATABASE_URL="postgres://$(whoami)@localhost:5432/qando_mcp_spike" \
BETTER_AUTH_URL="${1:-http://localhost:4200}" \
BETTER_AUTH_SECRET=mcp-prototype-secret-never-deployed-0123456789 \
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false \
exec npx tsx --conditions=@qando/source apps/api/src/main.ts
