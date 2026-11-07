-- V12: staff sign-out also ends the identity-provider single sign-on session (OIDC RP-initiated logout).
-- The ID token is kept server-side only as the id_token_hint for that logout (it grants no API access) and is erased
-- when the session is revoked.
ALTER TABLE user_sessions ADD COLUMN id_token_hint text;
