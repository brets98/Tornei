# Deploy on Google Cloud Run (free tier)

One container (`docker/cloudrun.Dockerfile`: the API server also serves the built client) on
Cloud Run, with the database on MongoDB Atlas's free cluster. With little traffic this stays
inside both free tiers. The Docker Compose stack (`docker-compose.prod.yml`) still works for a
VPS: same code, only the hosting differs.

## 1. Database: MongoDB Atlas (free M0)

1. Sign up at https://www.mongodb.com/cloud/atlas and create a **Free (M0)** cluster.
   Provider **Google Cloud**, region **Belgium (europe-west1)** if offered, otherwise the
   closest one in Europe.
2. **Database Access**: add a user with a password (letters and digits only, so it needs no
   escaping in the URL).
3. **Network Access**: add `0.0.0.0/0`. Cloud Run has no fixed outgoing IP (one costs money),
   so the password is what protects the database: make it long.
4. **Connect > Drivers**: copy the connection string and add the database name `tornei`
   after the host:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/tornei?retryWrites=true&w=majority`

## 2. Email (SMTP)

Any SMTP server works. Free and simple: Gmail. Turn on 2-step verification on the account,
then create an **app password** at https://myaccount.google.com/apppasswords. Host
`smtp.gmail.com`, port `587`, user = the Gmail address, password = the app password
(up to 500 emails a day).

## 3. Google Cloud

1. https://console.cloud.google.com: create a project and link a billing account. A card is
   required even for the free tier; nothing is charged within its limits.
2. Open **Cloud Shell** (the `>_` icon, top right) and run:

   ```bash
   git clone https://github.com/brets98/tornei && cd tornei
   gcloud config set project YOUR_PROJECT_ID
   bash deploy/cloudrun/setup.sh
   ```

   It asks for the SMTP settings, the Atlas connection string and (optionally) the Google
   OAuth client, then creates everything, deploys, and prints the app URL
   (`https://tornei-<project number>.europe-west1.run.app`) and what to do next.
3. **Budget alert**: Billing > Budgets & alerts > Create budget, amount 1, alerts by email.

## 4. Automatic deploys from GitHub

Add the four repository **variables** the script prints (GitHub > Settings > Secrets and
variables > Actions > Variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SA`). They are not secrets: GitHub signs in to Google without any key, and only
from this repository. From then on every push to `main` that passes the checks builds the
image and deploys it (`deploy` job in `.github/workflows/ci.yml`).

## 5. Google login

In the OAuth client (APIs & Services > Credentials) add the authorized redirect URI
`<app URL>/api/auth/callback/google`. If you add Google login after the first setup, run
`setup.sh` again: it asks only for what is missing.

## Day to day

- **Make someone admin**: Atlas > Browse Collections > `tornei.users`, edit the user and set
  `role` to `admin`.
- **Change a secret** (e.g. the SMTP password), then start a new revision so it is read:

  ```bash
  printf '%s' 'NEW VALUE' | gcloud secrets versions add tornei-smtp-password --data-file=-
  gcloud run services update tornei --region=europe-west1 --update-labels=refreshed=$(date +%s)
  ```

  Then destroy the old version (Secret Manager page): the free tier covers 6 active versions.
- **Logs**: Cloud Run > tornei > Logs.

## Limits to know

- **Cold start**: with no visitors the container stops; the first request after a pause
  takes a few seconds.
- **Free compute is about 50 hours of activity a month** (180,000 vCPU-seconds at 1 vCPU).
  An instance counts as active while it is answering a request, and an open live result
  stream (public landing page, `/api/results/stream`) is a request. A landing page left open
  on a screen around the clock would use it up: watch Billing in the first weeks.
- **One instance at most** (`--max-instances=1`): live results use an in-process event bus,
  and it caps the cost. Plenty for this traffic.
- **Atlas M0**: 512 MB of data, no automatic backups (take one with `mongodump` now and then).
