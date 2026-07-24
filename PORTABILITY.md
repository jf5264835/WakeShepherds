# Portability notes

This package is a standalone edition of the Shepherding Care Dashboard. It does
not require ChatGPT Sites, Vinext, Cloudflare Workers, Cloudflare D1, Wrangler,
OpenAI identity headers, or an `.openai/hosting.json` manifest.

## Replacements

| Original hosting feature | Portable replacement |
| --- | --- |
| ChatGPT Sites deployment | Standard Next.js Node server |
| Vinext/Vite build | `next build` and `next start` |
| Cloudflare Worker entry point | Next.js standalone server |
| Cloudflare D1 binding | Local SQLite or hosted libSQL |
| Sites migration packaging | `npm run db:migrate` |
| Sites runtime environment | Standard `.env` variables |
| Optional ChatGPT identity helper | Removed; the dashboard's own accounts remain |

All dashboard routes, styles, icons, permissions, care workflows, Google email
integration, Planning Center integration, PWA manifest, and database migrations
are included.

## Not included

- Live pastoral-care records from the hosted database
- Passwords, OAuth credentials, refresh tokens, encryption keys, or other secrets
- ChatGPT Sites deployment metadata
- ChatGPT-specific build and preview scripts

This separation is intentional so the archive can be shared without exposing
private ministry information.
