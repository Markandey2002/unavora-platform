-- V10: staff web sign-in (BFF, Authorization Code + PKCE) and role-based MFA enforcement.

-- Roles whose members may only hold a session that was created with MFA (amr contains otp). Checked by the API on
-- sign-in AND on every request, so a frontend can never bypass it.
ALTER TABLE roles ADD COLUMN requires_mfa boolean NOT NULL DEFAULT false;
UPDATE roles SET requires_mfa = true WHERE code = 'director';

-- One row per sign-in attempt. The PKCE verifier and nonce stay on the server (ARCHITECTURE §4.3); the browser only
-- carries the opaque state. Single use (consumed_at) and short-lived (expires_at).
CREATE TABLE staff_auth_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state_hash    bytea        NOT NULL UNIQUE,
    nonce         varchar(100) NOT NULL,
    code_verifier varchar(200) NOT NULL,
    language      char(2)      NOT NULL DEFAULT 'en',
    created_at    timestamptz  NOT NULL DEFAULT now(),
    expires_at    timestamptz  NOT NULL,
    consumed_at   timestamptz,
    CONSTRAINT ck_staff_auth_language CHECK (language IN ('en','hi'))
);
CREATE INDEX idx_staff_auth_requests_expiry ON staff_auth_requests (expires_at);

-- Methods the identity provider reported for the session (e.g. "pwd otp"), for audit and support.
-- (session_token_hash is already UNIQUE, hence indexed.)
ALTER TABLE user_sessions ADD COLUMN auth_methods varchar(100);
