-- V2: identity module. Authentication is delegated to an OIDC provider; roles, permissions
-- and record ownership live here (PostgreSQL is the source of truth for authorisation).

CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_subject   varchar(128) UNIQUE,                      -- OIDC "sub"
    email              varchar(254) NOT NULL,
    full_name          varchar(200) NOT NULL,
    phone_e164         varchar(20),
    status             varchar(20)  NOT NULL DEFAULT 'invited',
    preferred_language char(2)      NOT NULL DEFAULT 'en',
    mfa_enrolled       boolean      NOT NULL DEFAULT false,
    last_login_at      timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_status CHECK (status IN ('invited','active','disabled')),
    CONSTRAINT ck_users_language CHECK (preferred_language IN ('en','hi')),
    CONSTRAINT ck_users_phone CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(50)  NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    description text
);

CREATE TABLE permissions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(80) NOT NULL UNIQUE,
    description text
);

CREATE TABLE role_permissions (
    role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    uuid NOT NULL REFERENCES roles(id),
    granted_by uuid REFERENCES users(id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles (role_id);

-- Server-side web sessions for the Next.js BFF (opaque id, hashed at rest). Tokens never reach the browser.
CREATE TABLE user_sessions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token_hash       bytea       NOT NULL UNIQUE,
    user_id                  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at               timestamptz NOT NULL DEFAULT now(),
    last_seen_at             timestamptz NOT NULL DEFAULT now(),
    idle_expires_at          timestamptz NOT NULL,
    absolute_expires_at      timestamptz NOT NULL,
    mfa_verified_at          timestamptz,
    revoked_at               timestamptz,
    refresh_token_ciphertext bytea,                                  -- KMS/app-key encrypted
    user_agent_hash          bytea,
    ip_hash                  bytea
);
CREATE INDEX idx_user_sessions_user ON user_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_sessions_expiry ON user_sessions (absolute_expires_at);
