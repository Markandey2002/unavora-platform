# LOCAL ONLY: prints a Keycloak access token for one of the synthetic dev-realm staff users, for testing the staff API
# with curl / Postman (header "Authorization: Bearer <token>"). Uses the same users and TOTP logic as
# validate_business_flow.py; the director token needs a fresh TOTP window, so it can take up to 30 s.
#   python infra/local/scripts/staff_token.py director|employee1|employee2
# Tokens are short-lived (Keycloak dev realm default); request a new one when you get 401.
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("flow", os.path.join(HERE, "validate_business_flow.py"))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)

who = sys.argv[1] if len(sys.argv) > 1 else "employee1"
if who not in flow.USERS:
    sys.exit(f"unknown user {who!r}; choose one of: {', '.join(flow.USERS)}")
print(flow.token(who))
