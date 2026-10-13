#!/usr/bin/env bash
# One-time setup of Tornei on Google Cloud Run (see deploy/cloudrun/README.md).
# Run it in Google Cloud Shell, from the repository root:
#
#   git clone https://github.com/brets98/tornei && cd tornei
#   gcloud config set project YOUR_PROJECT_ID
#   bash deploy/cloudrun/setup.sh
#
# Safe to run again: existing resources and secrets are kept (change a secret with
# `gcloud secrets versions add`), the image is rebuilt and the service redeployed.
set -euo pipefail

PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}
REGION=${REGION:-europe-west1}
GITHUB_REPO=${GITHUB_REPO:-brets98/tornei}
SERVICE=tornei
REPO=tornei

[[ -n "$PROJECT_ID" ]] || { echo "Set a project first: gcloud config set project YOUR_PROJECT_ID"; exit 1; }
[[ -f docker/cloudrun.Dockerfile ]] || { echo "Run this from the repository root"; exit 1; }

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
APP_URL="https://$SERVICE-$PROJECT_NUMBER.$REGION.run.app"
RUN_SA="tornei-run@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_SA="tornei-deploy@$PROJECT_ID.iam.gserviceaccount.com"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/tornei:setup-$(date +%Y%m%d%H%M%S)"

echo "Project $PROJECT_ID, region $REGION"
echo "The app will be at $APP_URL"
echo

ask() { # ask VAR "Question" [default]
  local answer
  read -r -p "$2${3:+ [$3]}: " answer
  printf -v "$1" '%s' "${answer:-${3:-}}"
}

ask_secret() { # ask_secret VAR "Question"
  local answer
  read -r -s -p "$2: " answer
  echo
  printf -v "$1" '%s' "$answer"
}

secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }

create_secret() { # create_secret NAME VALUE
  printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=automatic --data-file=- >/dev/null
  echo "Created secret $1"
}

echo "== Enabling APIs (takes a minute the first time)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com cloudresourcemanager.googleapis.com

echo "== Settings (not secret)"
ask SMTP_HOST "SMTP host (Gmail: smtp.gmail.com)" "smtp.gmail.com"
ask SMTP_PORT "SMTP port" "587"
ask SMTP_SECURE "SMTP secure (true for port 465)" "false"
ask SMTP_USER "SMTP user (Gmail: your address)"
ask MAIL_FROM "Sender shown in emails" "Tornei <${SMTP_USER}>"
ask GOOGLE_CLIENT_ID "Google OAuth client ID (empty: Google login off)"

echo "== Secrets (stored in Secret Manager, never in the image)"
if ! secret_exists tornei-mongodb-uri; then
  ask_secret value "MongoDB Atlas connection string (mongodb+srv://…/tornei?…)"
  create_secret tornei-mongodb-uri "$value"
fi
if ! secret_exists tornei-auth-secret; then
  create_secret tornei-auth-secret "$(openssl rand -base64 32)"
fi
if ! secret_exists tornei-smtp-password; then
  ask_secret value "SMTP password (Gmail: an app password)"
  create_secret tornei-smtp-password "$value"
fi
if [[ -n "$GOOGLE_CLIENT_ID" ]] && ! secret_exists tornei-google-secret; then
  ask_secret value "Google OAuth client secret"
  create_secret tornei-google-secret "$value"
fi

SECRETS="MONGODB_URI=tornei-mongodb-uri:latest,BETTER_AUTH_SECRET=tornei-auth-secret:latest,SMTP_PASSWORD=tornei-smtp-password:latest"
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  SECRETS="$SECRETS,GOOGLE_CLIENT_SECRET=tornei-google-secret:latest"
fi

echo "== Service accounts"
gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create tornei-run --display-name="Tornei (Cloud Run runtime)"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create tornei-deploy --display-name="Tornei (GitHub Actions deploy)"

# The app reads only its own secrets
for s in tornei-mongodb-uri tornei-auth-secret tornei-smtp-password tornei-google-secret; do
  secret_exists "$s" || continue
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUN_SA" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

echo "== Image registry (keeps the 2 latest images, to stay in the free 0.5 GB)"
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"
fi
policy=$(mktemp)
cat >"$policy" <<'EOF'
[
  { "name": "keep-latest", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 2 } },
  { "name": "delete-older", "action": { "type": "Delete" }, "condition": { "olderThan": "1d" } }
]
EOF
gcloud artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" \
  --policy="$policy" --no-dry-run >/dev/null
rm -f "$policy"

echo "== Building and pushing the image"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -f docker/cloudrun.Dockerfile -t "$IMAGE" .
docker push "$IMAGE"

echo "== Deploying"
yaml() { printf "'%s'" "${1//\'/\'\'}"; } # single-quoted YAML string
env_file=$(mktemp)
{
  echo "BETTER_AUTH_URL: $(yaml "$APP_URL")"
  echo "SMTP_HOST: $(yaml "$SMTP_HOST")"
  echo "SMTP_PORT: $(yaml "$SMTP_PORT")"
  echo "SMTP_SECURE: $(yaml "$SMTP_SECURE")"
  echo "SMTP_USER: $(yaml "$SMTP_USER")"
  echo "MAIL_FROM: $(yaml "$MAIL_FROM")"
  echo "GOOGLE_CLIENT_ID: $(yaml "$GOOGLE_CLIENT_ID")"
} >"$env_file"

# max-instances 1: live results use an in-process event bus, and it caps the cost.
# timeout 3600: the live result stream (SSE) stays open up to an hour, then reconnects.
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" \
  --service-account="$RUN_SA" --allow-unauthenticated \
  --min-instances=0 --max-instances=1 --cpu=1 --memory=512Mi --timeout=3600 --no-cpu-boost \
  --env-vars-file="$env_file" --set-secrets="$SECRETS"
rm -f "$env_file"

echo "== GitHub Actions deploy access (keyless, only for $GITHUB_REPO)"
POOL=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe github --location=global \
  --workload-identity-pool=github >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc github --location=global \
    --workload-identity-pool=github --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer >/dev/null
gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:$DEPLOY_SA" >/dev/null

cat <<EOF

Done. The app is at $APP_URL

Next:
1. GitHub > $GITHUB_REPO > Settings > Secrets and variables > Actions > Variables, add:
     GCP_PROJECT_ID    $PROJECT_ID
     GCP_REGION        $REGION
     GCP_WIF_PROVIDER  $POOL/providers/github
     GCP_DEPLOY_SA     $DEPLOY_SA
   From then on every push to main deploys automatically.
2. Google login: in the OAuth client add the redirect URI
     $APP_URL/api/auth/callback/google
3. Billing > Budgets & alerts: create a budget of 1 (your currency) with email alerts.
EOF
