# DEPLOYMENT_EC2.md — staging and production on EC2 (D-044)

Added 2026-11-21. Nothing described here has been created in AWS yet. The workflows and scripts are written and
checked for syntax, but they have **not run against a real AWS account**. The ARCHITECTURE §14 gates still apply:
staging first, then a human approval before production.

## 1. How a release flows

```
push to main ──► ci (secret scan, API, web, e2e) ──green──► deploy.yml
                                                             │
        build unavora-api:<sha>, unavora-edge:<sha>  ◄───────┘   (ECR, immutable tags, GitHub OIDC role)
                         │
   STAGING (automatic)   ├─ build unavora-web:<sha>-staging
                         ├─ SSM Run Command on the staging instance:
                         │    pull edge image → copy /bundle → deploy.sh → health check → rollback if unhealthy
                         └─ smoke test https://<staging-domain> (/en, /hi, robots; /internal, /actuator → 404)
                         │
   PRODUCTION            ├─ waits for a required reviewer on the GitHub "production" environment
   (manual approval)     └─ same steps with unavora-web:<sha>-production
```

On each instance (`infra/ec2/bundle/compose.yaml`), Docker Compose runs:

| Container | Image | Role |
|---|---|---|
| `nginx` | `unavora-edge` (nginx 1.27 + config) | Ports 80/443. TLS (Let's Encrypt) and HSTS. Proxies everything to `web`. Serves approved media at `/media/`. Refuses unknown host names |
| `certbot` | `certbot/certbot:v3.0.1` | Gets the certificate once DNS points at the instance, then checks for renewal twice a day. nginx reloads by itself |
| `web` | `unavora-web` | Next.js standalone server (site, CRM, `/_bff`). Calls the API on the private Docker network |
| `api` | `unavora-api` | Spring Boot (profile `staging` or `production`). **Not published to the internet**; the actuator is on 127.0.0.1:8081 for health checks |

PostgreSQL is **Amazon RDS**. Secrets and settings live in **SSM Parameter Store** and are read by the instance
itself, never by GitHub. GitHub stores no AWS keys and no SSH key; it assumes an IAM role through OIDC.

## 2. One-time setup (per AWS account)

Region: `ap-south-1` assumed (ARCHITECTURE).

1. **ECR**: create the repositories `unavora-api`, `unavora-web` and `unavora-edge`, with **tag immutability on**.
   Add a lifecycle rule that keeps the last 30 images.
2. **GitHub OIDC**: add the identity provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
   Create the role `unavora-github-deploy` with trust `infra/ec2/iam/github-deploy-trust.json` and policy
   `infra/ec2/iam/github-deploy-policy.json`, replacing `ACCOUNT_ID`, `REGION` and the instance ids.
3. **RDS PostgreSQL 17**, one per environment: private subnets, not publicly accessible, encrypted, automated
   backups. Its security group allows 5432 **only from the instance's security group**. Create database `unavora`
   and an application user. Flyway creates the schema on the first API start; the production profile never loads
   synthetic seed data.
4. **EC2**, one per environment: Amazon Linux 2023, `t3.medium` (4 GB) recommended for production. `t3.small` fits
   staging if you set `API_MEM_LIMIT=768m` in `/opt/unavora/shared/limits.env`. Settings:
   - Elastic IP and 30 GB gp3 encrypted root volume. The media folders live there; take EBS snapshots.
   - IMDSv2 required. Instance profile with **AmazonSSMManagedInstanceCore** plus `infra/ec2/iam/instance-policy.json`
     (replace `ENVIRONMENT` with `staging` or `production`).
   - Security group: inbound **80 and 443 from anywhere only**. No port 22; use Session Manager for shell access.
   - Tag it `unavora-env=<env>`. Run `infra/ec2/bootstrap.sh` once as root (Session Manager or user data).
5. **DNS**: an A record for the environment's host name → the Elastic IP. Staging can go live first on a new
   subdomain. **The production cutover from the existing WordPress site is a separate, approved step** (gate G4); do
   not change the live record as part of this setup.
6. **SSM parameters** (section 3).
7. **GitHub** (repository Settings):
   - Variables (repository level): `AWS_REGION` (`ap-south-1`), `AWS_DEPLOY_ROLE_ARN`, `ECR_REGISTRY`
     (`<account>.dkr.ecr.ap-south-1.amazonaws.com`).
   - Environments `staging` and `production`, each with the variables `SITE_URL` (`https://…`, no trailing slash)
     and `EC2_INSTANCE_ID`.
   - On `production`, add **Required reviewers** (the director) and restrict deployments to the `main` branch.

## 3. SSM Parameter Store

Path `/unavora/<env>/…`, one parameter per variable. Use **SecureString** for anything secret (marked 🔒).
Parameter Store rejects empty values: where a value is unused, store the text `unused`.

| Path | Value |
|---|---|
| `deploy/DOMAIN` | host name only, e.g. `staging.example.in` |
| `deploy/ACME_EMAIL` | address for Let's Encrypt expiry notices |
| `api/DB_URL` | `jdbc:postgresql://<rds-endpoint>:5432/unavora?sslmode=require` |
| `api/DB_USER` | application database user |
| `api/DB_PASSWORD` 🔒 | its password |
| `api/OIDC_ISSUER_URI` | staff identity provider issuer (Cognito user pool or hosted Keycloak realm) |
| `api/STAFF_AUTH_MODE` | `oidc` |
| `api/STAFF_OIDC_ISSUER_URI` | same issuer |
| `api/STAFF_OIDC_CLIENT_ID` | confidential web client id |
| `api/STAFF_OIDC_CLIENT_SECRET` 🔒 | its secret |
| `api/STAFF_OIDC_REDIRECT_URI` | `https://<domain>/_bff/staff/callback` |
| `api/STAFF_OIDC_POST_LOGOUT_REDIRECT_URI` | `https://<domain>/_bff/staff/signed-out` |
| `api/CORS_ALLOWED_ORIGINS` | `https://<domain>` |
| `api/INTERNAL_SERVICE_TOKEN` 🔒 | long random value (`openssl rand -base64 48`); **same value** as `web/INTERNAL_SERVICE_TOKEN` |
| `api/OTP_HMAC_SECRET` 🔒 | long random value |
| `api/CUSTOMER_GOOGLE_MODE` | `disabled` until a Google OAuth client is approved |
| `api/GOOGLE_OAUTH_CLIENT_ID` | `unused` (until then) |
| `api/WHATSAPP_OTP_MODE` | `disabled` (no real provider adapter exists yet) |
| `api/MALWARE_SCANNER` *(optional)* | `clamd` once a scanner runs; without one, uploads stay `not_scanned` and cannot be approved |
| `web/INTERNAL_SERVICE_TOKEN` 🔒 | same as the API's |
| `web/CUSTOMER_AUTH_MODE` | `disabled` (or `google` once approved, with `web/GOOGLE_OAUTH_CLIENT_ID` and 🔒 `web/GOOGLE_OAUTH_CLIENT_SECRET`) |
| `web/SITE_INDEXABLE` | `false` on staging (refused otherwise); `true` on production only at go-live |

`deploy.sh` refuses to deploy if any adapter is set to `mock`. The API itself also refuses mock adapters and
sample content outside `local`/`test`.

## 4. Operating it

- **First deployment**: once DNS resolves, push to main or run **Actions → deploy → Run workflow**. The first
  certificate usually arrives within a minute. Until it does, the site answers HTTP 503 "TLS certificate pending" and
  the smoke test fails. Re-run the workflow once the certificate is there.
- **Redeploy or roll back to an earlier commit**: Actions → deploy → Run workflow, `sha` = that commit (must be on
  main). Images are reused when the tag already exists. It still goes through staging and the production approval.
- **Automatic rollback**: if the API readiness probe or `/en` is not healthy within 5 minutes, `deploy.sh` restarts
  the previous release and the workflow fails. The database is never rolled back. Migrations must stay
  backward-compatible (ARCHITECTURE §14).
- **Logs** (Session Manager on the instance):
  ```
  cd /opt/unavora/current
  docker compose --env-file .env logs -f api web nginx
  ```
- **Releases** are in `/opt/unavora/releases/<sha>`, the live one is `/opt/unavora/current`, and the last five are kept.

## 5. Known limits of this setup (accepted for now)

- **Short downtime on every deploy** (about 20–60 s while the API restarts). There is one instance per environment
  and no blue/green. Deploy production outside business hours.
- **Media are stored on the instance's disk** (`/srv/unavora/data`), served by nginx at `/media/`. This is an interim
  adapter until S3 + CDN (LAUNCH_READINESS §5). Back it up with EBS snapshots; it is lost if the volume is lost.
- **No malware scanner is deployed**: staff and owner uploads cannot be approved until a `clamd` service (or an S3
  scanning pipeline) exists.
- **Staff sign-in needs a real OIDC provider** (Cognito per ARCHITECTURE, or a hosted Keycloak) with director TOTP.
  Without one the CRM cannot be used.
- **Not covered**: WAF, CloudFront, autoscaling and multi-AZ, all from the ECS design (ARCHITECTURE §7). Revisit when
  traffic justifies it.
