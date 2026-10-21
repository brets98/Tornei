# CLAUDE.md

Project instructions for Claude Code. Read them at the start of every session and update them whenever a decision changes.

## The project

Web app with user authentication. Features will be defined and added gradually: do not anticipate features that haven't been requested.

## Principles

- **Vendor independence**: only open-source, self-hostable components. Do not introduce SaaS services, paid libraries or dependencies tied to a specific cloud without asking first.
- **Minimal costs**: everything must run on a single cheap VPS with Docker Compose.
- **Everything in Docker**: the whole project must start with `docker compose up`, in development and in production.

## Stack (MERN)

- **Frontend**: React + Vite, TypeScript
- **Backend**: Node.js (LTS, currently 24) + Express 5, TypeScript (ESM)
- **Database**: MongoDB. Development: a container with data on a Docker volume. Production: a **MongoDB Atlas** cluster (chosen by the user on 2026-10-21, replacing Mongo on the VM), reached through `MONGODB_URI` in `.env`; the app only needs a standard MongoDB connection string, so it can move back to a self-hosted Mongo by changing that value.
- **ODM**: Mongoose
- **Reverse proxy / HTTPS (production)**: Caddy, with automatic certificates. The production `web` image is Caddy serving the built client and proxying `/api/*` to the server.

## Authentication

- Handled in the backend with **Better Auth** (open source, self-hosted), configured in `server/src/auth/auth.ts` and mounted at `/api/auth/*`. The client uses its React client (`client/src/lib/auth-client.ts`).
- Providers: **Google (OAuth 2.0)**, enabled only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, and **email + password**. Passwords are hashed with **argon2id** (`@node-rs/argon2`, prebuilt binaries, no compiler needed), minimum 10 characters.
- **Registration** is switched by `SIGNUP_ENABLED` (default: open in development, closed in production). Closed means no email sign-up and no new users from Google; existing users still sign in. `GET /api/health` reports it (`signUp`) so the sign-in page offers "Create an account" only when open. First production account: set it to `true`, restart, sign up, set it back.
- Email + password requires **email verification** before sign-in; password reset by email link. Emails go through SMTP (`server/src/mail/mailer.ts`); in development they are caught by Mailpit.
- Add other providers (Microsoft, GitHub, etc.) through Better Auth's `socialProviders`.
- **Apple Sign In: do NOT implement** until explicitly requested (it requires the paid Apple Developer Program).
- Server-side sessions stored in MongoDB, cookies `httpOnly`, `sameSite=lax`, and `secure` in production (HTTPS).
- A user can link multiple providers to the same account (same email). Linking only happens when the email is verified on both sides (protects against account takeover).
- Better Auth owns the `users`, `sessions`, `accounts` and `verifications` collections. `users` has the extra fields `surname` (required on email sign-up) and `role` (cannot be set by the client).
- **Roles** are stored in the `roles` collection (`server/src/models/role.ts`); `user.role` holds the role's `name`. Current roles: `admin`, `user` (default), created on server startup by `ensureDefaultRoles()`. Use the `ROLES` constants in code, never string literals. `server/src/models/user.ts` is a Mongoose read model of `users`: new users are created only through sign-up or Google login.
- To make someone an admin (no UI yet): open `docker compose exec mongo mongosh tornei` and run `db.users.updateOne({ email: '...' }, { $set: { role: 'admin' } })`. In production (Atlas), from the folder with the compose file: `docker compose exec backup bash -c 'mongosh "$MONGODB_URI"'`.
- Better Auth doesn't create MongoDB indexes: `ensureAuthIndexes()` (`server/src/auth/indexes.ts`) creates them on startup, with TTL indexes on `expiresAt` that delete expired sessions and tokens. Add one there when a new query needs it.
- Client IP (rate limiting, sessions): Better Auth reads `X-Forwarded-For`, which Caddy sets to the connecting client's address (it ignores the value sent by clients). The server port is not published in production, so every request goes through Caddy.

### Auth: still to do

Before going live:
- Test Google login and account linking end to end with real credentials.

When a feature needs it:
- Account page (edit profile, change email), account deletion (GDPR) and privacy policy, admin user management UI, HTML email templates.

### API access: private by default

- **Every `/api` route requires an authenticated user**, enforced by one global check (`requireAuth` in `server/src/app.ts`), not per route. Unauthenticated requests get `401`. Inside protected routes the user is `req.user`; use `requireAdmin` for admin-only routes.
- Public routes are an explicit, short allowlist: health check and the auth routes (login, registration, logout). Make any other route public only when there is a concrete need, and only after asking.
- Current public routes: `GET /api/health` (also says whether registration is open), `/api/auth/*`, `GET /api/results/latest` and `GET /api/results/stream` (latest result text and time only, for the public landing page; approved 2026-10-09).
- Live updates use **Server-Sent Events**: `/api/results/stream` sends the latest result on connect and pushes each new one (`resultEvents` in `server/src/routes/results.ts`); the client listens with `EventSource` in `components/LatestResult.tsx` (tests use `test/fake-event-source.ts`). The event bus is in-process, so it assumes a single server instance. Public routers are mounted before `requireAuth` in `server/src/app.ts`.
- Client: signed-out visitors see `PublicLandingPage` at `/` and the sign-in form at `/sign-in` (and on any page that needs an account).
- Per-route authorization (roles, ownership) goes on top of authentication where needed. Never expose other users' personal data (e.g. emails) publicly.
- The frontend calls protected routes with the session cookie, sent automatically on same-origin requests: no tokens in client code, and no "secret" API keys in the frontend.

## Domain: tournaments

A repository of padel/tennis tournaments. `docs/prototype.html` is the original single-tournament prototype: reference for behavior and look & feel only (navy `#1f3864`, gold `#c99b38`), never port its code.

- **Ownership**: every tournament belongs to its creator (`ownerId`); only they can read or edit it. Another user's tournament answers `404`. A public read-only link is a possible later feature, not now.
- **Storage**: one document per tournament in `tournaments` (`server/src/models/tournament.ts`), with courts, time slots, pairs, groups and matches embedded. **Everything is persisted**: setup, group distribution, every result, and the derived state (standings, who fills each bracket slot, winners, champions, status/progress summary). The server recomputes the derived state after every write (`refreshTournament()`); the client only renders what the server returns. Writes use Mongoose optimistic concurrency: a concurrent change answers `409` and the client reloads.
- **Domain logic** is pure functions with unit tests in `server/src/domain/` (validation, scores, distribution, round robin, standings, brackets, status). Setup validation returns issue codes with params; the client maps them to messages in the user's language.
- **Entries** ("pairs"): 1 player (tennis singles) or 2 (doubles; padel is always doubles). A pair is shown by its players' names (`Rossi / Bianchi`), or by its code (`A1`, group letter + position; knockout-only: seed number) while names are empty. Stable ids: pairs `p1…`, groups `A…`, courts `c1…`, slots `t1…`.
- **Structure**, chosen in the creation wizard:
  - `groups_knockout`: N groups (letters A, B, …), pairs distributed as evenly as possible (sizes differ by at most 1, larger groups first), assigned in order; the user can move pairs or run a random draw. The top `advanceA` of each group go to bracket A, the next `advanceB` (optional) to bracket B. Every group needs at least 2 pairs and at least `advanceA + advanceB`; each bracket needs at least 2 entrants.
  - `knockout`: a single bracket A with all pairs, seeded in entry order.
  - `groups`: one round-robin group; its ranking decides the winner. (More groups always need a knockout phase.)
- **Structure changes** (pairs count, groups, group assignment) are allowed only while no result has been entered; they regenerate the matches. Title, subtitle, date, courts and time slots can change at any time (settings tab, `updateSettings()`): courts and slots keep their ids, new ones get a fresh id never reused, and removing one in use asks for confirmation in the client, then clears it from those matches. The match format can change only while no result has been entered (`MATCH_FORMAT_LOCKED`).
- **Match format** (chosen in the wizard, `matchFormat: { bestOf, gamesPerSet, decider }`; rules in `isValidMatchFormat()`, `server/src/domain/score.ts`, mirrored in `client/src/lib/score.ts`): one set to 6, a pro set to 9 (tie-break at 8-8), or best of 3 or 5 sets to 6 with a tie-break to 7 at 6-6 (best of 5 is tennis only: `MATCH_FORMAT_PADEL_FIVE_SETS`). The deciding set (third or fifth) is either a normal set (`set`), a set whose tie-break at 6-6 goes to 10 (`tiebreak10`, as in Grand Slams: the set still ends 7-6 and counts like any set), or a super tie-break to 10 that replaces the set (`superTiebreak`, common in padel: it counts as a set won). The wizard defaults to best of 3 with a super tie-break for padel, best of 3 played out for tennis.
- **Results** are stored set by set (`sets: [{ a, b, tiebreak?: { a, b } }]`, side A first; a super tie-break stores its points as `a`/`b`). Checked strictly against the match format (`checkSets()`): valid sets only (6-4, 7-5, 7-6…), a tie-break won at 7 (10 where the format says so) by 2 by the set winner (points optional), a super tie-break at 10 by 2, and a complete result with no extra sets; anything else is refused with an issue code saying which set is wrong. A match is *done* once it has a valid result. The UI writes results the usual way, `6-3 4-6 7-6(5)` (the bracket holds the tie-break loser's points), and shows them set by set on the bracket, tie-break points in superscript. Each match also has an optional court and time slot (one slot = one match).
- **Standings** (per group): wins → sets difference → games difference (a super tie-break counts as one game) → head-to-head (only when exactly two pairs are tied) → games won → initial order in the group. A group's positions feed the brackets only once all its matches are done; until then the bracket shows placeholders ("1° Girone A").
- **Brackets**: size = next power of 2; the top seeds get byes. Seeds are ordered by group position, then group letter (A1, B1, C1, …, A2, B2, …); knockout-only uses entry order. Standard placement (seed 1 vs last, 1 and 2 in opposite halves), then entrants of the same tier are swapped so pairs from the same group meet as late as possible (never in the first round when avoidable). Winners advance automatically. A knockout result remembers which pairs played it: if an earlier result changes who plays, the later result is flagged as no longer valid and doesn't count until it is re-entered or cleared. No third-place match.
- **Status** (derived): draft (no result yet) → group phase → knockout phase → finished (every bracket has a champion, or the single group is complete). Progress = done matches / total matches (byes excluded).
- **Duplicate** copies setup, pairs and schedule, without results. **Reset** clears results (after confirmation), keeping setup, pairs, groups and schedule. **Export/import** (`server/src/domain/transfer.ts`): a JSON file `{ format: 'tornei.tournament', version: 1, tournament }` with setup, pairs, groups or seeding, and each match's result, court, time and `scoredPairs`; derived state is left out and recomputed. Import checks everything like the wizard and the editor (setup issue codes, score codes, else `IMPORT_INVALID`; another version: `IMPORT_VERSION`), keeps court/slot ids, and always creates a new tournament. Bump `EXPORT_VERSION` and keep reading older versions when the format changes.
- **Conflicts** (derived and saved, `conflicts`, `server/src/domain/conflicts.ts`): two matches on the same court and time slot, or a known pair with two matches in the same slot (byes excluded), in slot order. The overview lists them above the matches and marks the rows.
- **API** (`server/src/routes/tournaments.ts`, all private): `GET /api/tournaments` (list: name, sport, date, summary), `POST /api/tournaments/preview` (wizard: issues + group sizes and brackets, saves nothing), `POST /api/tournaments`, `GET|DELETE /api/tournaments/:id`, `POST /api/tournaments/:id/duplicate` (body `name`, sent by the client in the user's language). Edits, each returning the whole refreshed tournament: `PATCH …/:id/pairs/:pairId` (`players`), `PUT …/:id/groups` (every group with its `pairIds`), `POST …/:id/draw` (random groups, or seeding without groups), `PATCH …/:id/matches/:matchId` (`sets`, `courtId`, `timeSlotId`; only the fields sent; `sets: []` clears the result), `PATCH …/:id/settings` (`name`, `subtitle`, `date`, `courts: [{ id?, name }]`, `timeSlots: [{ id?, time }]`, `matchFormat`; only the fields sent), `POST …/:id/reset`. Data: `GET …/:id/export` (the file) and `POST /api/tournaments/import` (the file as body, up to 1 MB; answers the new tournament). Edits are pure functions in `server/src/domain/edit.ts`; refused changes answer `400` with `issues`, the same codes as the wizard.
- **Client**: `/` is the tournament list (`TournamentsPage`, with import), `/tournaments/new` the wizard, `/tournaments/:id` the tournament with tabs (overview: stats, conflicts, every match filterable by phase/court/time with court and time editable, groups, courts; `?tab=groups`, or `entries` for a knockout without groups; `settings`: general fields, courts, times, match format, export and reset; and `bracket-A`/`bracket-B`: rounds in columns, sides not known yet shown by where they come from, e.g. "1° Girone A" or "Vincitore Quarto 2"; views in `client/src/components/tournament/`). Knockout results that no longer count (`stale`) are flagged on the match, with a button to clear them, and in a warning above every tab. `/live` and `/live/:id` (`LivePage`, menu "Live view", linked from each tournament) show the tournaments as cards (name, sport, date, status, progress) and then the chosen one read-only, with a link back to the cards and a switch between the groups (`GroupsBoard`) and each bracket (`BracketView` without `actions`): `?view=groups` or `bracket-A`/`bracket-B`, otherwise the current phase (groups, then bracket A once the knockout has started); a full screen button shows the chosen view over the whole screen with the tournament name, update time and switch (`useFullscreen`: the Fullscreen API, or a fixed overlay where it is missing, e.g. iPhone; Escape leaves); reloaded every 30 seconds (`REFRESH_MS`) or on request; a failed reload keeps the last data and says so. It is private like the rest: a public link is still a later feature. Fields save when left (`CommitInput`), except settings, saved together with a button (`SettingsView`, remounted on each save via `updatedAt`); `TournamentPage` shows each change at once, sends saves one at a time, and reloads the tournament when a save fails or conflicts.

## Repository structure

```
/client                      # React + Vite
/server                      # Express API (src/, tests in test/)
/docker                      # Dockerfiles and configuration
  server.Dockerfile          #   targets: dev, prod
  web.Dockerfile             #   targets: dev (Vite), prod (Caddy + built client)
  Caddyfile
docker-compose.yml           # development (hot reload)
docker-compose.prod.yml      # production
.env.example                 # all required variables, without real values
.github/workflows/ci.yml     # CI/CD with GitHub Actions
```

Client: React Router (`client/src/App.tsx` defines routes; signed-in pages render inside `components/Layout.tsx`, with the left menu), pages in `client/src/pages/`, API calls via `apiGet()` in `client/src/lib/api.ts`. Tests mock the auth client with `vi.mock('…/lib/auth-client')` (mock in `lib/__mocks__/`).

**Languages**: the whole UI is in English and Italian, switchable at any time (`LanguageSwitch` in the menu, on the public page and on the sign-in page). Strings live in `client/src/i18n/en.ts` (defines the shape, `Messages`) and `it.ts` (same keys; TypeScript enforces it); components read them with `const { t } = useI18n()` and fill `{placeholders}` with `fill()`. Never hardcode UI text. The choice is saved in the browser (`localStorage`), defaulting to the browser language (Italian if it starts with `it`, else English). The server sends codes (e.g. setup `issues`), never UI text. Tests: components render in English without a provider; use `renderIn('it', …)` from `client/src/test/render.tsx` to test in Italian.

`client` and `server` are independent npm packages (no workspaces), each with its own `package-lock.json`. Docker builds use the repository root as context.

## Conventions

- Secrets and credentials only in `.env` (never committed). Every new variable must be added to `.env.example` with a comment.
- Lint and formatting with ESLint + Prettier (shared `.prettierrc.json` at the root).
- Every collection has an id and a last-change time: always build Mongoose schemas with `createSchema()` from `server/src/db/schema.ts` (adds `createdAt`/`updatedAt` and exposes `id` instead of `_id` in JSON). Better Auth's collections already have both.
- Tests: Vitest for the client; Vitest + Supertest for the API. API tests that need a database use `useTestDatabase()` from `server/test/db.ts` (in-memory MongoDB); `createTestApp()` and `signUp()` from `server/test/app.ts` give an app with captured emails and a signed-in agent (optionally admin).
- Every feature on a dedicated branch, with small, descriptive commits; merge into `main` via pull request.
- Before declaring a task done: lint and tests must pass and the app must start with Docker Compose.

## Deploy

- **Target server**: Google Cloud's free `e2-micro` VM (1 GB RAM, `us-east1`), used as a plain VPS; step-by-step setup in `docs/deploy-gcp.md`. The database is MongoDB Atlas (the VM's IP must be in Atlas' Network Access list). `docker-compose.prod.yml` is sized for the VM: rotated container logs, 2 GB swap on the host. Keep new services light.
- GitHub Actions: on every push runs lint, format check, typecheck, tests and build; on `main` it builds the Docker images and publishes them to GitHub Container Registry (`ghcr.io/brets98/tornei-server`, `ghcr.io/brets98/tornei-web`, tagged `latest` and the commit SHA).
- The `deploy` job (after publishing, on `main`) copies `docker-compose.prod.yml` to the VPS as `docker-compose.yml` in `VPS_DIR` and runs `docker compose pull && up -d` with `IMAGE_TAG` set to the commit SHA. It is skipped until the repository variables `VPS_HOST`, `VPS_USER`, `VPS_DIR` and the secrets `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` are set. If the GHCR packages are private, run `docker login ghcr.io` once on the VPS with a read-only token.
- **Secrets in production live only on the VPS**, in a `.env` created by hand and readable only by the deploy user (`chmod 600`). Images and CI never contain app secrets: the deploy job only needs an SSH key (GitHub Actions secret) to run `docker compose pull && docker compose up -d`. Possible later step: SOPS + age to version encrypted secrets in git. OpenBao/Vault only if there are multiple servers or people.
- Never put secrets in the client: `VITE_*` variables end up in the public JavaScript bundle.
- **Backups**: the `backup` service in `docker-compose.prod.yml` runs `mongodump` against Atlas on start and every 24 hours into `./backups` on the VPS, keeping `BACKUP_KEEP_DAYS` days (restore command in the compose file). Still to do: copy them off the server (another machine or storage), or a disk failure loses them too.

## Commands

```bash
# Development (app http://localhost:5173, API :3000, MongoDB 127.0.0.1:27017, emails http://localhost:8025)
docker compose up --build
# After adding/updating npm dependencies: -V refreshes the containers' node_modules volumes
docker compose up --build -V

# Production (needs .env: see .env.example, "Production" and "Email" sections, plus BETTER_AUTH_SECRET)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# In client/ or server/ (run `npm install` first)
npm run lint
npm run format          # or format:check
npm run typecheck
npm test
npm run build
```

Hot reload in Docker uses polling (nodemon `--legacy-watch`, Vite `usePolling`), because file events don't propagate through bind mounts on Windows.
