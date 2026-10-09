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
- **Database**: MongoDB in a container, with data persisted on a Docker volume (no external managed database, for now)
- **ODM**: Mongoose
- **Reverse proxy / HTTPS (production)**: Caddy, with automatic certificates. The production `web` image is Caddy serving the built client and proxying `/api/*` to the server.

## Authentication

- Handled in the backend with **Better Auth** (open source, self-hosted), configured in `server/src/auth/auth.ts` and mounted at `/api/auth/*`. The client uses its React client (`client/src/lib/auth-client.ts`).
- Providers: **Google (OAuth 2.0)**, enabled only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, and **email + password**. Passwords are hashed with **argon2id** (`@node-rs/argon2`, prebuilt binaries, no compiler needed), minimum 10 characters.
- Email + password requires **email verification** before sign-in; password reset by email link. Emails go through SMTP (`server/src/mail/mailer.ts`); in development they are caught by Mailpit.
- Add other providers (Microsoft, GitHub, etc.) through Better Auth's `socialProviders`.
- **Apple Sign In: do NOT implement** until explicitly requested (it requires the paid Apple Developer Program).
- Server-side sessions stored in MongoDB, cookies `httpOnly`, `sameSite=lax`, and `secure` in production (HTTPS).
- A user can link multiple providers to the same account (same email). Linking only happens when the email is verified on both sides (protects against account takeover).
- Better Auth owns the `users`, `sessions`, `accounts` and `verifications` collections. `users` has the extra fields `surname` (required on email sign-up) and `role` (cannot be set by the client).
- **Roles** are stored in the `roles` collection (`server/src/models/role.ts`); `user.role` holds the role's `name`. Current roles: `admin`, `user` (default), created on server startup by `ensureDefaultRoles()`. Use the `ROLES` constants in code, never string literals. `server/src/models/user.ts` is a Mongoose read model of `users`: new users are created only through sign-up or Google login.
- To make someone an admin (no UI yet): open `docker compose exec mongo mongosh tornei` and run `db.users.updateOne({ email: '...' }, { $set: { role: 'admin' } })`.
### Auth: still to do

Before going live:
- MongoDB indexes for Better Auth collections (`sessions.token`, `sessions.userId`, `accounts.userId`, `verifications.identifier`) and TTL indexes on `expiresAt` so expired sessions/tokens are deleted.
- Test Google login and account linking end to end with real credentials.
- Verify Better Auth's rate limiting sees the real client IP behind Caddy (`X-Forwarded-For`).

When a feature needs it:
- Account page (edit profile, change email), account deletion (GDPR) and privacy policy, admin user management UI, HTML email templates.

### API access: private by default

- **Every `/api` route requires an authenticated user**, enforced by one global check (`requireAuth` in `server/src/app.ts`), not per route. Unauthenticated requests get `401`. Inside protected routes the user is `req.user`; use `requireAdmin` for admin-only routes.
- Public routes are an explicit, short allowlist: health check and the auth routes (login, registration, logout). Make any other route public only when there is a concrete need, and only after asking.
- Current public routes: `GET /api/health`, `/api/auth/*`, `GET /api/results/latest` (latest result text and time only, for the public landing page; approved 2026-10-09). Public routers are mounted before `requireAuth` in `server/src/app.ts`.
- Client: signed-out visitors see `PublicLandingPage` at `/` and the sign-in form at `/sign-in` (and on any page that needs an account).
- Per-route authorization (roles, ownership) goes on top of authentication where needed. Never expose other users' personal data (e.g. emails) publicly.
- The frontend calls protected routes with the session cookie, sent automatically on same-origin requests: no tokens in client code, and no "secret" API keys in the frontend.

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

`client` and `server` are independent npm packages (no workspaces), each with its own `package-lock.json`. Docker builds use the repository root as context.

## Conventions

- Secrets and credentials only in `.env` (never committed). Every new variable must be added to `.env.example` with a comment.
- Lint and formatting with ESLint + Prettier (shared `.prettierrc.json` at the root).
- Every collection has an id and a last-change time: always build Mongoose schemas with `createSchema()` from `server/src/db/schema.ts` (adds `createdAt`/`updatedAt` and exposes `id` instead of `_id` in JSON). Better Auth's collections already have both.
- Tests: Vitest for the client; Vitest + Supertest for the API. API tests that need a database use `useTestDatabase()` from `server/test/db.ts` (in-memory MongoDB); `createTestApp()` and `signUp()` from `server/test/app.ts` give an app with captured emails and a signed-in agent (optionally admin).
- Every feature on a dedicated branch, with small, descriptive commits; merge into `main` via pull request.
- Before declaring a task done: lint and tests must pass and the app must start with Docker Compose.

## Deploy

- GitHub Actions: on every push runs lint, format check, typecheck, tests and build; on `main` it builds the Docker images and publishes them to GitHub Container Registry (`ghcr.io/brets98/tornei-server`, `ghcr.io/brets98/tornei-web`, tagged `latest` and the commit SHA).
- The VPS pulls the new images and restarts with `docker-compose.prod.yml`.
- **Secrets in production live only on the VPS**, in a `.env` created by hand and readable only by the deploy user (`chmod 600`). Images and CI never contain app secrets: the deploy job only needs an SSH key (GitHub Actions secret) to run `docker compose pull && docker compose up -d`. Possible later step: SOPS + age to version encrypted secrets in git. OpenBao/Vault only if there are multiple servers or people.
- Never put secrets in the client: `VITE_*` variables end up in the public JavaScript bundle.
- Periodic backup of the MongoDB volume (to be defined together with the server).

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
