# Deploy on Google Cloud's free VM

The whole app (Caddy, API, MongoDB, backups) runs with Docker Compose on one free
**e2-micro** VM. Google Cloud is only used as a plain Linux server: moving to another
VPS means repeating these steps there.

Free tier limits (check [the current terms](https://docs.cloud.google.com/free/docs/free-cloud-features)):
one e2-micro in `us-east1`, `us-central1` or `us-west1`, 30 GB of **standard** persistent
disk, 1 GB of outbound traffic per month. Anything else is billed.

## 1. Google Cloud account and budget alert

1. Create an account at <https://console.cloud.google.com> and a project (e.g. `tornei`).
   A billing account (card) is required even for the free tier.
2. **Billing → Budgets & alerts → Create budget**: amount 1 €, alerts at 50% and 100%.
   It emails you as soon as something is not free (e.g. the external IPv4 address, if
   Google bills it for your account).

## 2. Create the VM

**Compute Engine → VM instances → Create instance**:

| Setting      | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Name         | `tornei`                                                       |
| Region       | `us-east1` (closest free region to Europe), any zone           |
| Machine type | E2 → `e2-micro`                                                |
| Boot disk    | Ubuntu 24.04 LTS (x86/64), **Standard persistent disk**, 30 GB |
| Firewall     | ✔ Allow HTTP traffic, ✔ Allow HTTPS traffic                    |

The default disk type (balanced) is **not** free: change it to _Standard_.

Then **VPC network → IP addresses**: find the VM's external address and **Promote to
static**, so it doesn't change on reboot. Note it as `<IP>`.

## 3. Domain

Point a domain at `<IP>` with an `A` record. Caddy needs it for the HTTPS certificate.

- Own domain (about 10 €/year): add `A  tornei  <IP>` at your registrar.
- Free: a subdomain from [DuckDNS](https://www.duckdns.org) (`<name>.duckdns.org` → `<IP>`).

## 4. Prepare the server

Open **SSH** from the VM's row in the console, then:

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh

# 2 GB swap: 1 GB of RAM is tight for MongoDB + Node
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Deploy user (used by GitHub Actions) and the app folder
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/tornei && sudo chown deploy: /opt/tornei
```

## 5. Deploy key

On your PC (Git Bash), create a key used only for deploying:

```bash
ssh-keygen -t ed25519 -N '' -C tornei-deploy -f ~/.ssh/tornei_deploy
cat ~/.ssh/tornei_deploy.pub
```

On the VM, authorize it for `deploy`:

```bash
sudo -u deploy mkdir -p -m 700 /home/deploy/.ssh
echo '<content of tornei_deploy.pub>' | sudo -u deploy tee /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Check from your PC: `ssh -i ~/.ssh/tornei_deploy deploy@<IP> docker ps`.

## 6. Email (SMTP)

Verification and password-reset emails need an SMTP server (Google Cloud blocks port 25,
so use 587). For a few users, a Gmail account works:

1. Turn on 2-step verification on the Google account, then create an **App password**
   at <https://myaccount.google.com/apppasswords>.
2. Settings: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
   `SMTP_USER=<address>@gmail.com`, `SMTP_PASSWORD=<app password>`,
   `MAIL_FROM=Tornei <<address>@gmail.com>` (Gmail sends only from your own address).

Any other SMTP provider works by changing these values.

## 7. Configuration on the server

As `deploy` (`sudo -iu deploy`), create `/opt/tornei/.env` from [`.env.example`](../.env.example):

```bash
cd /opt/tornei
nano .env        # paste .env.example and fill it in
chmod 600 .env
```

- `DOMAIN`: the domain from step 3.
- `MONGO_ROOT_PASSWORD`, `BETTER_AUTH_SECRET`: generate each with `openssl rand -hex 32`.
- SMTP values from step 6.
- `SIGNUP_ENABLED=true` for now (step 9), Google values later (step 10).

## 8. Images and GitHub settings

The VM pulls the images from GitHub Container Registry. They hold no secrets, so the
simplest is to make them public: on GitHub, **your profile → Packages → `tornei-server`
→ Package settings → Change visibility → Public**, and the same for `tornei-web`.
(Otherwise run `docker login ghcr.io` on the VM as `deploy`, with a classic token with
only `read:packages`.)

In the repository, **Settings → Secrets and variables → Actions**:

- Variables: `VPS_HOST` = `<IP>`, `VPS_USER` = `deploy`, `VPS_DIR` = `/opt/tornei`.
- Secrets: `VPS_SSH_KEY` = content of `~/.ssh/tornei_deploy` (the private key),
  `VPS_KNOWN_HOSTS` = output of `ssh-keyscan <IP>`.

The next push to `main` (e.g. merging a pull request) deploys: the deploy job copies the
compose file and starts the app. To deploy without a new commit: **Actions → CI → the
latest run on `main` → Re-run all jobs**. Open `https://<domain>`: the first visit may take a
minute while Caddy gets the certificate.

## 9. First account

1. Sign up on the site and open the link in the verification email.
2. Make yourself admin, on the VM as `deploy`:

   ```bash
   cd /opt/tornei
   docker compose exec mongo mongosh -u "$(grep ^MONGO_ROOT_USERNAME .env | cut -d= -f2)" -p --authenticationDatabase admin tornei
   # at the prompt: the MONGO_ROOT_PASSWORD, then
   db.users.updateOne({ email: '<your email>' }, { $set: { role: 'admin' } })
   ```

3. Close registration: set `SIGNUP_ENABLED=false` in `.env`, then `docker compose up -d`.

## 10. Google login (optional)

In the same Google Cloud project:

1. **APIs & Services → OAuth consent screen**: External, app name, your email; publish
   the app (basic scopes need no review).
2. **Credentials → Create credentials → OAuth client ID → Web application**, authorized
   redirect URI `https://<domain>/api/auth/callback/google`.
3. Put the client ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`),
   then `docker compose up -d`.

With registration closed, Google sign-in works only for emails that already have an account.

## Day to day

- Every merge to `main` deploys automatically.
- Logs: `docker compose logs -f server`. Status: `docker compose ps`. Memory: `free -h`.
- Backups land in `/opt/tornei/backups` every day. Copy them off the server now and then,
  from your PC: `scp -i ~/.ssh/tornei_deploy -r deploy@<IP>:/opt/tornei/backups .`
- Check **Billing → Reports** after the first days: it should stay at 0.
