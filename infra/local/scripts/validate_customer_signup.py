"""
LOCAL ONLY. Validates the customer signup slice against the RUNNING local stack with MOCK adapters:

  Continue with Google (mock) -> profile created once (no duplicate on re-login) -> WhatsApp OTP (mock inbox)
  -> callback + site-visit requests = separate leads, separate enquiry/marketing consent
  -> CRM: registered customer visible to director even without enquiry; contact actions; communication history;
     follow-ups; employee isolation.

No Google account and no WhatsApp provider is contacted. Staff tokens come from the local Keycloak dev realm.
Run:  python infra/local/scripts/validate_customer_signup.py      (exit 0 = all checks passed)
"""
import base64
import datetime
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_business_flow import API, check, http, results, sql, token  # noqa: E402

SERVICE = {"X-Internal-Service-Token": os.environ.get("INTERNAL_SERVICE_TOKEN", "local-dev-internal-token-not-a-secret")}


def b64(s):
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip("=")


def cred(sub, email, name):
    return f"mock-google:{b64(sub)}:{b64(email)}:{b64(name)}"


def internal(method, path, body=None, session=None, extra=None):
    h = dict(SERVICE)
    if session:
        h["X-Customer-Session"] = session
    h.update(extra or {})
    return http(method, f"{API}{path}", body, h)


def main():
    tag = uuid.uuid4().hex[:8]
    sub, email = f"mock-validate-{tag}", f"validate.{tag}@example.test"
    phone = "+9197" + str(uuid.uuid4().int)[:8]

    s, _ = http("POST", f"{API}/internal/v1/customer-auth/google", {"credential": cred(sub, email, "V")})
    check("internal API refuses calls without service credential", s == 401, f"status={s}")

    s, r1 = internal("POST", "/internal/v1/customer-auth/google", {"credential": cred(sub, email, "Validation Customer (synthetic)")})
    check("first Google login creates account", s == 200 and r1["newAccount"] is True and r1["customer"]["reference"].startswith("CUS-"), f"{s}")
    s, r2 = internal("POST", "/internal/v1/customer-auth/google", {"credential": cred(sub, email, "Validation Customer (synthetic)")})
    check("second login returns same profile, newAccount=false",
          s == 200 and r2["newAccount"] is False and r2["customer"]["reference"] == r1["customer"]["reference"])
    row = sql(f"""SELECT count(*)||'|'||min(ci.login_count)||'|'||bool_and(ci.registered_at IS NOT NULL AND ci.last_login_at >= ci.registered_at)
                  ||'|'||min(ci.email)||'|'||min(ci.display_name)
                  FROM customer_identities ci WHERE ci.provider='google' AND ci.provider_subject='{sub}'""")
    check("one identity row with Google id, name, Gmail, registration date, last login, login count 2",
          row == f"1|2|true|{email}|Validation Customer (synthetic)", row)
    check("no duplicate customer profile", sql(f"SELECT count(*) FROM customers WHERE email_normalized='{email}'") == "1")
    session = r2["sessionToken"]

    td, t1 = token("director"), token("employee1")
    auth = lambda t: {"Authorization": f"Bearer {t}"}
    cid = sql(f"SELECT id FROM customers WHERE email_normalized='{email}'")
    s, page = http("GET", f"{API}/api/v1/staff/customers?registered=true&limit=50", headers=auth(td))
    check("director sees registered customer without any enquiry",
          s == 200 and any(c["email"] == email and c["openLeads"] == 0 for c in page["items"]), f"status={s}")
    s, _ = http("GET", f"{API}/api/v1/staff/customers/{cid}", headers=auth(t1))
    check("employee cannot see unassigned registered customer -> 404", s == 404, f"status={s}")

    s, _ = internal("POST", "/internal/v1/customer/requests", {"type": "callback", "enquiryConsent": True, "marketingConsent": False}, session)
    check("request before WhatsApp verification -> 409", s == 409, f"status={s}")

    s, otp = internal("POST", "/internal/v1/customer/whatsapp/otp", {"phone": phone}, session)
    check("WhatsApp OTP requested (mock adapter)", s == 202, f"status={s}")
    s, msg = internal("GET", f"/internal/v1/dev/mock-whatsapp/latest?phone={phone.replace('+', '%2B')}")
    check("mock inbox received a 6-digit code", s == 200 and len(msg["code"]) == 6 and msg["code"].isdigit(), f"status={s}")
    s, _ = internal("POST", "/internal/v1/customer/whatsapp/verify", {"phone": phone, "code": "000000" if msg["code"] != "000000" else "111111"}, session)
    check("wrong code rejected", s == 422, f"status={s}")
    s, prof = internal("POST", "/internal/v1/customer/whatsapp/verify", {"phone": phone, "code": msg["code"]}, session)
    check("correct code verifies WhatsApp number", s == 200 and prof["whatsappVerified"] and prof["whatsappNumber"] == phone, f"status={s}")
    check("OTP stored only as hash; code not in DB",
          sql(f"SELECT count(*) FROM phone_verifications WHERE phone_e164='{phone}' AND position('{msg['code']}' in encode(code_hash,'hex'))=0") == "1")

    s, cb = internal("POST", "/internal/v1/customer/requests",
                     {"type": "callback", "message": "Evening", "enquiryConsent": True, "marketingConsent": False},
                     session, {"Idempotency-Key": str(uuid.uuid4())})
    check("callback request -> lead", s == 201 and cb["reference"].startswith("LEAD-"), f"{s} {cb}")
    s, pages = http("GET", f"{API}/api/v1/public/properties?lang=en")
    prop = next(p for p in pages["items"] if "3 BHK" in p["title"])
    date = (datetime.date.today() + datetime.timedelta(days=4)).isoformat()
    s, sv = internal("POST", "/internal/v1/customer/requests",
                     {"type": "site_visit", "propertyId": prop["id"], "preferredDate": date, "enquiryConsent": True, "marketingConsent": True},
                     session)
    check("site visit request -> separate lead", s == 201 and sv["reference"] != cb["reference"], f"{s} {sv}")
    leads = sql(f"SELECT string_agg(enquiry_type, ',' ORDER BY created_at) FROM leads WHERE customer_id='{cid}'")
    check("two separate leads for one customer (callback, site_visit)", leads == "callback,site_visit", leads)
    consents = sql(f"SELECT string_agg(purpose||':'||granted, ',' ORDER BY id) FROM customer_consents WHERE customer_id='{cid}'")
    check("enquiry and marketing consent recorded separately",
          consents == "service_contact:true,marketing_whatsapp:false,service_contact:true,marketing_whatsapp:true", consents)

    s, det = http("GET", f"{API}/api/v1/staff/customers/{cid}", headers=auth(t1))
    check("assigned employee (site visit property owner) now sees customer", s == 200, f"status={s}")
    if s == 200:
        check("contact details and call/WhatsApp actions provided",
              det["customer"]["whatsapp"] == phone and det["actions"]["callUrl"] == f"tel:{phone}"
              and det["actions"]["whatsappUrl"] == f"https://wa.me/{phone[1:]}", json.dumps(det["actions"]))
        check("employee sees only own lead of this customer", len(det["leads"]) == 1 and det["leads"][0]["enquiryType"] == "site_visit")
        lead_id = det["leads"][0]["id"]
        s, _ = http("POST", f"{API}/api/v1/staff/customers/{cid}/communications",
                    {"channel": "phone", "direction": "outbound", "summary": "Confirmed visit time (synthetic)", "leadId": lead_id}, auth(t1))
        check("employee records a call", s == 201, f"status={s}")
        due = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat()
        s, _ = http("POST", f"{API}/api/v1/staff/customers/{cid}/follow-ups",
                    {"title": "Remind customer a day before visit", "dueAt": due, "leadId": lead_id}, auth(t1))
        check("employee creates follow-up", s == 201, f"status={s}")
        s, det2 = http("GET", f"{API}/api/v1/staff/customers/{cid}", headers=auth(td))
        check("director sees communication history and follow-ups",
              s == 200 and len(det2["communications"]) == 1 and det2["communications"][0]["recordOrigin"] == "employee_recorded"
              and len(det2["followUps"]) == 1 and len(det2["leads"]) == 2)
    s, _ = http("GET", f"{API}/api/v1/staff/customers/{cid}", headers=auth(token("employee2")))
    check("other employee cannot see this customer -> 404", s == 404, f"status={s}")

    s, _ = internal("POST", "/internal/v1/customer-auth/logout", session=session)
    s2, _ = internal("GET", "/internal/v1/customer/me", session=session)
    check("logout revokes session", s == 204 and s2 == 401, f"{s} {s2}")

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
