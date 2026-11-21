#!/usr/bin/env bash
# ONE-TIME setup of a fresh Amazon Linux 2023 EC2 instance for UNAVORA (staging or production).
# Run as root, e.g. through Systems Manager -> Session Manager, or paste it as EC2 user data.
# Installs Docker, the Compose plugin and jq, and creates the folders deploy.sh and compose.yaml expect.
# Safe to run again. It does not start the application: the first GitHub deployment does.
set -euo pipefail

COMPOSE_VERSION="v2.29.7"   # pinned; check https://github.com/docker/compose/releases before changing

dnf install -y docker jq
systemctl enable --now docker

# Docker Compose v2 plugin (Amazon Linux 2023 does not package it). Verified against the release's own checksum.
arch="$(uname -m)"   # x86_64 or aarch64
plugin_dir=/usr/local/lib/docker/cli-plugins
if ! docker compose version 2>/dev/null | grep -q "${COMPOSE_VERSION#v}"; then
  mkdir -p "$plugin_dir"
  base="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/docker-compose-linux-${arch}" "$base/docker-compose-linux-${arch}"
  curl -fsSL -o "$tmp/docker-compose-linux-${arch}.sha256" "$base/docker-compose-linux-${arch}.sha256"
  (cd "$tmp" && sha256sum -c "docker-compose-linux-${arch}.sha256")
  install -m 0755 "$tmp/docker-compose-linux-${arch}" "$plugin_dir/docker-compose"
  rm -rf "$tmp"
fi
docker compose version

# Folders. The API container runs as uid 10001 (services/api/Dockerfile) and writes the media folders.
install -d -m 0755 /opt/unavora /opt/unavora/releases
install -d -m 0700 /opt/unavora/shared
install -d -m 0755 /srv/unavora /srv/unavora/letsencrypt /srv/unavora/acme
install -d -m 0750 -o 10001 -g 10001 /srv/unavora/data
install -d -m 0700 -o 10001 -g 10001 /srv/unavora/data/private-uploads
install -d -m 0755 -o 10001 -g 10001 /srv/unavora/data/public-media

# The SSM agent is preinstalled on Amazon Linux 2023; make sure it runs (deployments arrive through it).
systemctl enable --now amazon-ssm-agent

echo "Bootstrap complete. Next: SSM parameters, DNS, then run the deploy workflow (docs/DEPLOYMENT_EC2.md)."
