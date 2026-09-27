# NekoCircle

[中文](README.md) · [日本語](README.ja.md) · **English**

Generate Twitter interaction circles using public FxTwitter, Yahoo Japan realtime search and Bing data. The interface supports Chinese, Japanese and English. Basic generation requires no login or API key.

## Features

- Score replies, quotes, mentions and reposts using direction, time decay and mutual interaction.
- Join renamed accounts by stable IDs and deduplicate the same reply across sources.
- MD3 interface, avatar fallbacks, search highlighting and zoom, full usernames and configurable label layering.
- Customize colors, count, layout, scores, usernames, watermark and circle ID visibility; display all collected participants.
- PNG downloads, public sharing links, saved-circle lookup and social previews.
- Optional long-term retention and temporary-data cleanup; admin statistics, settings, announcements, feedback and import/export.
- GitHub backups of circles authorized for long-term storage; historical offsets for lost cumulative statistics.
- “Today” starts at midnight UTC+8; build version appears at the bottom of each page.
- Windows / Baota two-version deployment and rollback, plus a Linux process supervisor.

## Quick start

Use Node.js 22 or 24 and npm. From the project root:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set `JWT_SECRET` in `.env.local` to a long random value. Preserve existing configuration instead of overwriting it.

Development:

```powershell
npm run dev -- -p 3001
```

Open [http://localhost:3001/en](http://localhost:3001/en), `/zh` or `/ja`.

Production: run each step only after the previous step succeeds.

```powershell
npm ci
npm run build
npm start -- -H 127.0.0.1 -p 3001
```

Configure Baota / Nginx on the domain’s ports 80/443 to proxy to `http://127.0.0.1:3001`. Persist the database and configuration. Do not overwrite a running release’s `.next` directory.

## Configuration and data

| Setting | Purpose |
| --- | --- |
| `JWT_SECRET` | Admin session signing; keep identical across releases |
| `DB_PATH` | SQLite path; defaults to `data/circle.db` |
| `SITE_URL` | Public origin for sharing and previews, e.g. `https://circle.example.com` |
| `HTTPS_PROXY` | Optional outbound HTTP / SOCKS proxy |
| `YAHOO_PROXY` | Optional Yahoo-specific proxy or relay |
| `BUILD_VERSION` | Optional build identifier; otherwise uses Git commit or build time for ZIP deployments |

Set the admin password on the first visit to `/admin/login`. There is no preset password; passwords are stored as bcrypt hashes. Restoring the existing database also preserves its password.

Configure GitHub owner, repository, existing branch, file path and token in admin settings. The token needs Contents read/write permission for the target repository and is not returned in plaintext. Backups contain only authorized long-term circles, excluding temporary circles, admin passwords and configuration tokens. Decompress `.json.gz` and import through admin data management to restore.

Cumulative generations and unique users support historical offsets. Today and activity charts use recorded events. Lost historical usernames prevent automatic exclusion of returning historical users from the unique-user offset.

## Rolling updates and supervision

See the [Windows / Baota deployment guide](docs/windows-rolling-update.md) (Chinese). The tool builds and checks a separate release, reloads Nginx and retains the previous process for rollback. Both processes share the existing database and retain static resources from both versions. Register the existing release and proxy configuration first.

On Linux, run `bash serve.sh` after building. The supervisor uses `/api/health/live` and restarts only after three failed checks. Deployment uses `/api/health/ready`, which also checks database access.

Supervisor variables: `NEKOCIRCLE_PORT` (3000), `NEKOCIRCLE_BIND` (127.0.0.1), `NEKOCIRCLE_STARTUP_GRACE_SECONDS` (60), `NEKOCIRCLE_CHECK_INTERVAL_SECONDS` (20), `NEKOCIRCLE_HEALTH_ATTEMPTS` (3), `NEKOCIRCLE_SHUTDOWN_GRACE_SECONDS` (15).

## Scoring and coverage

Type weights: reply `1`, quote `0.8`, mention `0.6`, repost `0.4`. Direction multipliers: inbound `1.5`, outbound `0.5`. Time weights are `1` for 0–2 days, `0.95` for 3–5 days and continuous exponential decay beyond 5 days.

```text
total = inbound × 1.5 + outbound × 0.5
balance = 2 × min(inbound, outbound) / (inbound + outbound)
score = ln(1 + total) × (0.75 + 0.25 × balance)
```

Balance is zero without interactions. Circle placement uses weighted scores; counts are retained separately. Bing supplements sparse primary-source data. Other available sources continue when one source fails.

Public search does not guarantee complete coverage. Yahoo usually covers roughly the last 30 days; private, deleted and unindexed posts cannot be collected. Avatar and upstream-service availability also affect results.

## Development

```powershell
npm test
npm run build
```

The build includes lint and TypeScript checks. Stack: Next.js 15, React 19, TypeScript, Tailwind CSS 4, SQLite, Canvas and `@vercel/og`.

`app/`: pages and APIs; `components/`: charts and interactions; `lib/`: providers, merging, scoring, database and backups; `messages/`: translations; `scripts/`: deployment; `tests/`: regression tests; `data/`: default database directory.

## License and credits

[AGPL-3.0-or-later](LICENSE). Inspired by [maebahesioru/nareaitter](https://github.com/maebahesioru/nareaitter).
