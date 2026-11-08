# qando — Documentation

Planning and design documents of qando v1 (delivery 2026-11-23). They are kept in step with the code: when a story or a contract changes, the document changes in the same pull request.

| Document | What it answers |
|---|---|
| [User stories](user-stories.md) | What each user can do in v1 (HU01–HU10), with acceptance criteria, error cases and permissions |
| [Gherkin features](../e2e/features/) | The stories as executable acceptance tests (`playwright-bdd`), one feature per story |
| [Sitemap](sitemap.md) | Every view, its URL, who can open it and the states it shows |
| [Diagrams](diagrams.md) | Architecture, entity-relationship, main flow and email (notification) flow |
| [API contract](api-contract.md) | REST resources, requests, responses, permissions and errors; the full OpenAPI document is generated from the schemas and served by the API |
| [Mockups](mockups.md) | Desktop screens and the changes each story makes to them; mobile-first approach |
| [Accessibility](accessibility.md) | How the pages meet WCAG 2.2 AA at 375, 768 and 1280 px: what the tests check on every run, the manual keyboard and screen-reader passes, and screenshots at each width |
| [Design tokens](design-tokens.md) | Colours, type, spacing, motion and breakpoints of the web app, and the contrast rules the tests enforce |
| [Code guide](code-guide.md) | Where each part of the code lives, its glossary, the main flows and, folder by folder, what each piece does and the functions it offers |
| [Backlog](backlog.md) | How the stories were split into issues, priorities and milestones; live state on the [GitHub Project](https://github.com/users/pietrodags/projects/1) |

Still to come: technical decisions and the run and deployment guide.
