# Edge image: nginx (TLS, reverse proxy to the Next.js server, approved public media) plus the deployment bundle
# (compose.yaml, deploy.sh) that the EC2 instance copies out of /bundle. One immutable tag per commit, so the
# nginx config and the deploy script always match the application images they were released with.
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/http-only.conf nginx/https.conf /etc/nginx/unavora/
COPY --chmod=0755 nginx/40-unavora-tls.sh /docker-entrypoint.d/40-unavora-tls.sh
COPY --chmod=0755 bundle/ /bundle/
