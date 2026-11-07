"""
LOCAL ONLY. End-to-end validation of the first vertical slice against the RUNNING local stack:

  Customer -> Property search -> Property details -> Enquiry (idempotent) -> Customer profile + consent
  -> CRM lead -> Employee lead access (own only) -> Director overview.

Uses real Keycloak tokens from the local dev realm (dev-cli password grant, LOCAL ONLY) and the real API.
Database checks go through `docker exec unavora-postgres psql`. Synthetic data only.

Run:  python infra/local/scripts/validate_business_flow.py
Exit code 0 = every check passed.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = "http://localhost:8080"
KC_TOKEN = "http://localhost:8180/realms/unavora-dev/protocol/openid-connect/token"
USERS = {  # synthetic local-realm users (infra/local/keycloak/unavora-dev-realm.json)
    "director": ("director.local", "Director-local-1"),
    "employee1": ("employee1.local", "Employee1-local-1"),
    "employee2": ("employee2.local", "Employee2-local-1"),
}
results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))


def http(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, raw.decode(errors="replace")


def token(who):
    user, pw = USERS[who]
    form = urllib.parse.urlencode({"grant_type": "password", "client_id": "dev-cli", "username": user, "password": pw}).encode()
    with urllib.request.urlopen(urllib.request.Request(KC_TOKEN, data=form), timeout=15) as r:
        return json.loads(r.read())["access_token"]


def sql(q):
    out = subprocess.run(["docker", "exec", "unavora-postgres", "psql", "-U", "unavora_local", "-d", "unavora", "-tAc", q],
                         capture_output=True, text=True, check=True)
    return out.stdout.strip()


def main():
    # 1. Property search
    s, page = http("GET", f"{API}/api/v1/public/properties?lang=en")
    check("search returns published listings", s == 200 and len(page["items"]) >= 1, f"status={s}")
    target = next(p for p in page["items"] if "3 BHK" in p["title"])
    s, _ = http("GET", f"{API}/api/v1/public/properties?lang=en&city=Noida")
    check("search filter by city", s == 200)

    # 2. Property details
    s, detail = http("GET", f"{API}/api/v1/public/properties/{target['slug']}?lang=en")
    check("property detail", s == 200 and detail["summary"]["id"] == target["id"], target["slug"])

    # 3. Enquiry submission (idempotent)
    phone_local = "98" + str(uuid.uuid4().int)[:8]
    phone = "+91" + phone_local
    key = str(uuid.uuid4())
    enquiry = {"name": "Flow Check Buyer (synthetic)", "phone": phone_local, "email": "flow.check@example.test",
               "message": "Validation run", "propertyId": target["id"], "language": "en", "consent": True}
    s1, r1 = http("POST", f"{API}/api/v1/public/enquiries", enquiry, {"Idempotency-Key": key})
    s2, r2 = http("POST", f"{API}/api/v1/public/enquiries", enquiry, {"Idempotency-Key": key})
    check("enquiry created (201)", s1 == 201 and r1["reference"].startswith("LEAD-"), f"{s1} {r1}")
    check("same Idempotency-Key returns same lead (200)", s2 == 200 and r2["reference"] == r1["reference"], f"{s2} {r2}")
    ref = r1["reference"]
    s, _ = http("POST", f"{API}/api/v1/public/enquiries", {**enquiry, "consent": False}, {"Idempotency-Key": str(uuid.uuid4())})
    check("enquiry without consent rejected (422)", s == 422, f"status={s}")

    # 4. Customer profile + consent
    check("exactly one customer profile for phone", sql(f"SELECT count(*) FROM customers WHERE phone_e164='{phone}'") == "1")
    check("exactly one lead for the idempotent submission", sql(f"SELECT count(*) FROM leads WHERE public_ref='{ref}'") == "1")
    consent = sql(f"""SELECT cc.purpose||'|'||cc.granted||'|'||cc.notice_version||'|'||cc.source FROM customer_consents cc
                      JOIN customers c ON c.id=cc.customer_id WHERE c.phone_e164='{phone}'""")
    check("enquiry consent recorded with notice version", consent.startswith("service_contact|true|privacy-notice-"), consent)

    # 5. CRM lead
    lead = sql(f"""SELECT l.id||'|'||ps.code||'|'||coalesce(l.assigned_user_id::text,'') FROM leads l
                   JOIN pipeline_stages ps ON ps.id=l.stage_id WHERE l.public_ref='{ref}'""").split("|")
    lead_id, stage, assignee = lead
    check("lead assigned to property owner (employee1)", stage == "assigned" and assignee.endswith("000000000102"), f"{stage} {assignee}")
    check("timeline, audit and outbox rows written",
          sql(f"SELECT count(*) FROM lead_activities WHERE lead_id='{lead_id}'") == "1"
          and sql(f"SELECT count(*) FROM audit_logs WHERE entity_id='{lead_id}' AND action='lead.created_public'") == "1"
          and sql(f"SELECT count(*) FROM outbox_events WHERE aggregate_id='{lead_id}'") == "1")

    # 6. Employee lead access
    t1, t2, td = token("employee1"), token("employee2"), token("director")
    auth = lambda t: {"Authorization": f"Bearer {t}"}
    s, _ = http("GET", f"{API}/api/v1/staff/leads")
    check("staff API without token -> 401", s == 401, f"status={s}")
    s, lst = http("GET", f"{API}/api/v1/staff/leads?limit=50", headers=auth(t1))
    check("employee1 (owner) sees the new lead in list", s == 200 and any(i["reference"] == ref for i in lst["items"]), f"status={s}")
    check("employee1 list contains only own leads", s == 200 and all((i["assignedUserId"] or "").endswith("102") for i in lst["items"]))
    s, row = http("GET", f"{API}/api/v1/staff/leads/{lead_id}", headers=auth(t1))
    check("employee1 opens lead detail with customer contact", s == 200 and row["phone"] == phone, f"status={s}")
    s, _ = http("GET", f"{API}/api/v1/staff/leads/{lead_id}", headers=auth(t2))
    check("employee2 cannot open employee1's lead -> 404", s == 404, f"status={s}")
    s, _ = http("GET", f"{API}/api/v1/director/overview", headers=auth(t1))
    check("employee cannot use director overview -> 403", s == 403, f"status={s}")

    # 7. Director overview
    s, lst = http("GET", f"{API}/api/v1/staff/leads?limit=50", headers=auth(td))
    check("director sees all leads incl. new one", s == 200 and any(i["reference"] == ref for i in lst["items"]), f"status={s}")
    s, ov = http("GET", f"{API}/api/v1/director/overview", headers=auth(td))
    check("director overview", s == 200 and ov["totalLeads"] >= 1 and ov["publishedProperties"] >= 1, json.dumps(ov)[:160] if s == 200 else f"status={s}")

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
