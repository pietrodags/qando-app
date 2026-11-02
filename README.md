# qando

qando helps a group find a date that works for everyone. The organizer proposes dates and times and shares a link; participants vote without creating an account; the organizer reads the results and confirms the date.

Work in progress.

## Development

Requires Node.js 26 (see `.nvmrc`; 24.15+ also works) and npm 11.

```sh
npm ci          # install every workspace
npm run build   # build domain, contracts, api and web
npm test        # run the unit tests of every workspace
npm run start:api   # API on http://localhost:3000 (PORT to change it)
npm run start:web   # web app on http://localhost:4200
```

| Workspace | Path | What |
|---|---|---|
| `@qando/domain` | `packages/domain` | Pure domain logic, no framework or database |
| `@qando/contracts` | `packages/contracts` | Schemas and types shared by API and web |
| `@qando/api` | `apps/api` | Express API (TypeScript) |
| `@qando/web` | `apps/web` | Angular 22 web app (zoneless, Vitest) |
