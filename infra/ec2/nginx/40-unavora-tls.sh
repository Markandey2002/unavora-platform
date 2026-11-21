#!/bin/sh
# Runs from the nginx image entrypoint before nginx starts. Chooses the site config:
#   - a Let's Encrypt certificate for $DOMAIN exists -> https.conf (HTTP redirects to HTTPS)
#   - not yet                                        -> http-only.conf (ACME challenges only, everything else 503)
# A background loop re-checks every minute and reloads nginx when the choice changes, and reloads every 6 hours so a
# renewed certificate (written by the certbot container) is picked up without a restart.
set -eu

case "${DOMAIN:-}" in
  ""|*[!a-z0-9.-]*) echo "40-unavora-tls: DOMAIN must be a lower-case host name (got '${DOMAIN:-}')" >&2; exit 1 ;;
esac

CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
OUT=/etc/nginx/conf.d/unavora.conf

render() {   # exit 0 = config changed
  if [ -s "$CERT" ]; then src=/etc/nginx/unavora/https.conf; else src=/etc/nginx/unavora/http-only.conf; fi
  sed "s/__DOMAIN__/$DOMAIN/g" "$src" > "$OUT.new"
  if cmp -s "$OUT.new" "$OUT" 2>/dev/null; then rm -f "$OUT.new"; return 1; fi
  mv "$OUT.new" "$OUT"
  echo "40-unavora-tls: using $(basename "$src") for $DOMAIN"
}

render || true

(
  i=0
  while :; do
    sleep 60
    i=$((i + 1))
    if render || [ $((i % 360)) -eq 0 ]; then
      nginx -t -q && nginx -s reload || echo "40-unavora-tls: reload skipped (config test failed)" >&2
    fi
  done
) &
