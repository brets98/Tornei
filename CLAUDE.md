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

- Handled entirely in the backend with **Passport.js**.
- Initial providers: **Google (OAuth 2.0)** and **email + password** (passwords hashed with bcrypt or argon2).
- Structured so other providers (Microsoft, GitHub, etc.) can be added easily.
- **Apple Sign In: do NOT implement** until explicitly requested (it requires the paid Apple Developer Program).
- Server-side sessions stored in MongoDB, cookies `httpOnly`, `secure` and `sameSite`.
- A user can link multiple providers to the same account (same email).

### API access: private by default

- **Every `/api` route requires an authenticated user**, enforced by one global check, not per route. Unauthenticated requests get `401`.
- Public routes are an explicit, short allowlist: health check and the auth routes (login, registration, logout). Make any other route public only when there is a concrete need, and only after asking.
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

`client` and `server` are independent npm packages (no workspaces), each with its own `package-lock.json`. Docker builds use the repository root as context.

## Conventions

- Secrets and credentials only in `.env` (never committed). Every new variable must be added to `.env.example` with a comment.
- Lint and formatting with ESLint + Prettier (shared `.prettierrc.json` at the root).
- Every collection has an id and a last-change time: always build Mongoose schemas with `createSchema()` from `server/src/db/schema.ts` (adds `createdAt`/`updatedAt` and exposes `id` instead of `_id` in JSON).
- Tests: Vitest for the client; Vitest + Supertest for the API. API tests that need a database use `useTestDatabase()` from `server/test/db.ts` (in-memory MongoDB).
- Every feature on a dedicated branch, with small, descriptive commits; merge into `main` via pull request.
- Before declaring a task done: lint and tests must pass and the app must start with Docker Compose.

## Deploy

- GitHub Actions: on every push runs lint, format check, typecheck, tests and build; on `main` it builds the Docker images and publishes them to GitHub Container Registry (`ghcr.io/brets98/tornei-server`, `ghcr.io/brets98/tornei-web`, tagged `latest` and the commit SHA).
- The VPS pulls the new images and restarts with `docker-compose.prod.yml`.
- Periodic backup of the MongoDB volume (to be defined together with the server).

## Commands

```bash
# Development (http://localhost:5173, API on :3000, MongoDB on 127.0.0.1:27017)
docker compose up --build

# Production (needs .env with DOMAIN, MONGO_ROOT_USERNAME, MONGO_ROOT_PASSWORD)
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
