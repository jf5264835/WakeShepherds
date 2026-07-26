# Shepherding Care Dashboard — Portable Edition

A complete self-hosted version of Wake Church's Shepherding Care Dashboard.
It includes the Global Admin, volunteer My Care app, Hospital Team, Pregnancy
Team, Wake Youth, Discipleship, Google assignment emails, Planning Center
People integration, permissions, audit history, and all current care timelines.

This package uses standard Next.js and can run on a Linux server, a Docker host,
or a Node-compatible hosting provider. It has no ChatGPT Sites runtime
dependency.

## What is included

- All application source under `app/`, `components/`, `lib/`, and `db/`
- All styles and public icons
- Complete SQLite/libSQL migration history
- Standard Next.js configuration and build commands
- Local and production environment templates
- Dockerfile and Docker Compose configuration
- Google Gmail OAuth and Planning Center OAuth integrations
- Security and portability documentation

The archive intentionally contains **no live care records or secrets**.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- For production: HTTPS and persistent storage

## Quick local setup guide

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your private environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`. Generate separate random values for the bootstrap password and
   encryption secret:

   ```bash
   openssl rand -base64 48
   openssl rand -base64 48
   ```

4. Create and migrate the database:

   ```bash
   npm run setup
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000` and sign in with:

   - Username: `global-admin`
   - Password: the value of `BOOTSTRAP_ADMIN_PASSWORD`

The first successful sign-in creates the initial Global Admin account. Change
its password from the admin dashboard after setup.

When opening the development server from another computer, use the server's
LAN address (for example, `http://10.64.5.45:3000`). The dashboard
automatically allows IP addresses assigned to the server. If you use a custom
local hostname or development proxy, add its hostname to
`ALLOWED_DEV_ORIGINS` in `.env`; separate multiple hostnames with commas.

## Production build

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

Set `APP_BASE_URL` to the final HTTPS address before connecting Google or
Planning Center. Run the application behind a trusted HTTPS reverse proxy such
as Caddy, Nginx, or your hosting provider's managed proxy.

## Docker deployment

1. Copy and edit the environment file:

   ```bash
   cp .env.example .env
   ```

2. Set `APP_BASE_URL` to the public HTTPS URL and replace every example secret.

3. Build and start:

   ```bash
   docker compose up -d --build
   ```

The container automatically applies pending database migrations before it
starts. The SQLite database is stored in the host `data/` directory.

To update later:

```bash
docker compose down
docker compose up -d --build
```

Back up the `data/` directory before updating.

## Database choices

### Local SQLite

Best for one persistent server or Docker host:

```env
DATABASE_URL=file:./data/shepherding.db
DATABASE_AUTH_TOKEN=
```

The `data/` directory must live on a persistent disk. Do not use local SQLite
on an ephemeral or serverless filesystem.

### Hosted libSQL

For multiple application instances or platforms without persistent local
storage:

```env
DATABASE_URL=libsql://your-database-host
DATABASE_AUTH_TOKEN=your-private-token
```

Run `npm run db:migrate` using the same environment before starting the app.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_BASE_URL` | Production | Public HTTPS origin used for OAuth callbacks and email links |
| `ALLOWED_DEV_ORIGINS` | Development only | Optional comma-separated custom hostnames allowed to load development assets |
| `DATABASE_URL` | Yes | Local SQLite file or remote libSQL URL |
| `DATABASE_AUTH_TOKEN` | Remote DB only | Authentication token for hosted libSQL |
| `BOOTSTRAP_ADMIN_PASSWORD` | First setup | Creates the first Global Admin account |
| `ENCRYPTION_SECRET` | Integrations | Encrypts stored Google and Planning Center tokens |

Never commit `.env`.

## Google assignment email setup

Create a Google OAuth web application and add:

```text
https://YOUR-DOMAIN/api/google/callback
```

as an authorized redirect URI. Enter the Client ID, Client Secret, and sender
email in Global Admin, then connect the correct Google account.

## Planning Center setup

Create a Planning Center OAuth application and add:

```text
https://YOUR-DOMAIN/api/planning-center/callback
```

as the redirect URI. Enter the credentials in Global Admin and connect the
authorized Planning Center account.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development |
| `npm run build` | Create the production build |
| `npm start` | Run the production server |
| `npm run lint` | Check source quality |
| `npm run typecheck` | Check TypeScript |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:generate` | Generate a migration after schema changes |
| `npm run setup` | Run initial database setup |

## Data migration

This source archive does not contain the current hosted database because it may
contain private pastoral information. Moving live records should be handled as
a separate, encrypted migration after the new server and access controls have
been reviewed.

## Important privacy note

Use this dashboard for light care coordination and follow-through. Do not treat
it as a clinical system or store detailed medical, counseling, abuse, or
confessional records. Read [SECURITY.md](SECURITY.md) before production use.

See [PORTABILITY.md](PORTABILITY.md) for the hosting-specific changes made in
this edition.
