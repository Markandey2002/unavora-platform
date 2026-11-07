"""LOCAL DEV ONLY: print the current sign-in code of the synthetic director.local user.

Reads the synthetic TOTP secret from the local Keycloak realm file (never a real secret) and prints the 6-digit code
(RFC 6238, HMAC-SHA1, 30 s, key = the secret's UTF-8 bytes, as Keycloak uses it). Keycloak accepts each code only
once per 30-second window, so after a failed or repeated sign-in wait for the next code.

  python infra\\local\\scripts\\director_totp.py           # current code
  python infra\\local\\scripts\\director_totp.py --setup   # also print the key for an authenticator app
"""
import base64
import hashlib
import hmac
import json
import pathlib
import struct
import sys
import time

REALM = pathlib.Path(__file__).resolve().parents[1] / "keycloak" / "unavora-dev-realm.json"


def director_secret() -> bytes:
    realm = json.loads(REALM.read_text(encoding="utf-8"))
    user = next(u for u in realm["users"] if u["username"] == "director.local")
    otp = next(c for c in user["credentials"] if c["type"] == "otp")
    return json.loads(otp["secretData"])["value"].encode("utf-8")


def code(secret: bytes, at: float) -> str:
    h = hmac.new(secret, struct.pack(">Q", int(at // 30)), hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return str((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


if __name__ == "__main__":
    secret = director_secret()
    now = time.time()
    print(f"director.local code: {code(secret, now)}  (valid for {30 - int(now % 30)} more seconds)")
    if "--setup" in sys.argv:
        key = base64.b32encode(secret).decode().rstrip("=")
        print(f"authenticator app key (time-based, 6 digits, 30 s, SHA1): {key}")
