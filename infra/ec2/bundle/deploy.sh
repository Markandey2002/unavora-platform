#!/usr/bin/env bash
# Runs ON the EC2 instance (as root, through AWS Systems Manager) from a release folder
# /opt/unavora/releases/<sha>/ that the workflow filled from the edge image's /bundle.
#
#   deploy.sh <staging|production> <api-image> <web-image> <edge-image>
#
# 1. reads this environment's settings and secrets from SSM Parameter Store:
#      /unavora/<env>/deploy/DOMAIN, /unavora/<env>/deploy/ACME_EMAIL
#      /unavora/<env>/api/<VAR>   -> /opt/unavora/shared/api.env  (mode 600)
#      /unavora/<env>/web/<VAR>   -> /opt/unavora/shared/web.env  (mode 600)
# 2. pulls the images and (re)starts the containers
# 3. waits for API readiness and the website; on failure rolls back to the previous release
# Secret values are never printed. Flyway migrations are forward-only and backward-compatible (ARCHITECTURE §14), so
# rolling back the containers after a migration is safe; the database is never rolled back automatically.
set -euo pipefail

ENVIRONMENT="${1:?environment}"; API_IMAGE="${2:?api image}"; WEB_IMAGE="${3:?web image}"; EDGE_IMAGE="${4:?edge image}"
case "$ENVIRONMENT" in staging|production) ;; *) echo "unknown environment: $ENVIRONMENT" >&2; exit 2 ;; esac
: "${AWS_REGION:?AWS_REGION must be set}"

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT=/opt/unavora
SHARED="$ROOT/shared"
CURRENT="$ROOT/current"
log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

mkdir -p "$SHARED" && chmod 700 "$SHARED"
umask 077

# ---- 1. settings and secrets -------------------------------------------------------------------------------
fetch_env() {   # $1 = SSM path, $2 = output file
  local tmp; tmp="$(mktemp "$SHARED/.env.XXXXXX")"
  aws ssm get-parameters-by-path --region "$AWS_REGION" --path "$1" --recursive --with-decryption --output json \
    | jq -er '
        .Parameters
        | if length == 0 then error("no parameters under the path") else . end
        | .[]
        | (.Name | split("/") | last) as $k
        | if ($k | test("^[A-Z][A-Z0-9_]*$") | not) then error("bad variable name: \($k)")
          elif (.Value | test("[\n\r]")) then error("multi-line value for \($k)")
          else "\($k)=\(.Value)" end' > "$tmp" \
    || { rm -f "$tmp"; echo "could not read SSM parameters under $1" >&2; exit 1; }
  mv "$tmp" "$2"
  log "$(wc -l < "$2" | tr -d ' ') settings from $1"
}
param() {
  aws ssm get-parameter --region "$AWS_REGION" --name "$1" --with-decryption --query Parameter.Value --output text
}

DOMAIN="$(param "/unavora/$ENVIRONMENT/deploy/DOMAIN")"
ACME_EMAIL="$(param "/unavora/$ENVIRONMENT/deploy/ACME_EMAIL")"
fetch_env "/unavora/$ENVIRONMENT/api/" "$SHARED/api.env"
fetch_env "/unavora/$ENVIRONMENT/web/" "$SHARED/web.env"

# Guard rails: these must never reach a deployed environment (the API refuses most of them at startup as well).
if grep -Eq '^(CUSTOMER_AUTH_MODE|CUSTOMER_GOOGLE_MODE|WHATSAPP_OTP_MODE|STAFF_AUTH_MODE|MALWARE_SCANNER)=mock$' "$SHARED/api.env" "$SHARED/web.env"; then
  echo "a mock adapter is configured for $ENVIRONMENT; refusing to deploy" >&2; exit 1
fi
if [ "$ENVIRONMENT" != production ] && grep -q '^SITE_INDEXABLE=true$' "$SHARED/web.env"; then
  echo "SITE_INDEXABLE=true is allowed only in production" >&2; exit 1
fi

umask 022
cat > "$RELEASE_DIR/.env" <<EOF
UNAVORA_ENV=$ENVIRONMENT
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL
API_IMAGE=$API_IMAGE
WEB_IMAGE=$WEB_IMAGE
EDGE_IMAGE=$EDGE_IMAGE
EOF
[ -f "$SHARED/limits.env" ] && cat "$SHARED/limits.env" >> "$RELEASE_DIR/.env"   # optional API_MEM_LIMIT / WEB_MEM_LIMIT

# ---- 2. pull and start ---------------------------------------------------------------------------------------
compose() { docker compose --project-directory "$1" -f "$1/compose.yaml" --env-file "$1/.env" "${@:2}"; }

PREVIOUS=""
[ -L "$CURRENT" ] && PREVIOUS="$(readlink -f "$CURRENT")"
[ "$PREVIOUS" = "$RELEASE_DIR" ] && PREVIOUS=""

for registry in $(printf '%s\n' "$API_IMAGE" "$WEB_IMAGE" "$EDGE_IMAGE" | cut -d/ -f1 | sort -u); do
  aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry" > /dev/null
done
log "pulling images"
compose "$RELEASE_DIR" pull --quiet
log "starting containers"
compose "$RELEASE_DIR" up -d --remove-orphans

# ---- 3. health, rollback -------------------------------------------------------------------------------------
healthy() {
  curl -fsS --max-time 5 http://127.0.0.1:8081/actuator/health/readiness > /dev/null \
    && curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:3000/en
}
wait_healthy() {
  for _ in $(seq 1 60); do healthy && return 0; sleep 5; done
  return 1
}

if wait_healthy; then
  ln -sfn "$RELEASE_DIR" "$CURRENT"
  log "release $(basename "$RELEASE_DIR") is live on https://$DOMAIN"
  # Keep the last five releases and recently used images (for rollback).
  ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
  docker image prune -af --filter "until=336h" > /dev/null || true
  exit 0
fi

log "NEW RELEASE UNHEALTHY - recent logs:"
compose "$RELEASE_DIR" logs --no-color --tail 80 api web || true
if [ -n "$PREVIOUS" ] && [ -f "$PREVIOUS/compose.yaml" ]; then
  log "rolling back to $(basename "$PREVIOUS")"
  compose "$PREVIOUS" up -d --remove-orphans
  if wait_healthy; then log "rollback healthy"; else log "ROLLBACK ALSO UNHEALTHY - needs attention"; fi
else
  log "no previous release to roll back to"
fi
exit 1
