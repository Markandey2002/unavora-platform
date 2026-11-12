# LOCAL ONLY: gives the [SAMPLE] listings and project licensed REPRESENTATIVE photos (owner decision 2026-11-12) until
# real photographs are onboarded. Downloads the photos listed in photos_plan.py (Unsplash License) into .cache/, then
# uploads them through the staff API: malware scan -> alt text, credit, licence -> director approval -> cover photo.
# Every one is labelled "Representative image" on the website. Re-runnable: photos already uploaded are skipped.
#   python infra/local/representative-photos/load_representative_photos.py      (API, Postgres, Keycloak running)
import importlib.util, json, os, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("flow", os.path.join(HERE, "..", "scripts", "validate_business_flow.py"))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
exec(open(os.path.join(HERE, "photos_plan.py"), encoding="utf-8").read())

API = "http://localhost:8080/api/v1/staff"
LICENCE = "Unsplash License (free commercial use, no permission needed)"
CACHE = os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)
for photos in PLAN.values():
    for pid, _ in photos:
        f = os.path.join(CACHE, pid + ".jpg")
        if not os.path.exists(f):
            req = urllib.request.Request(f"https://images.unsplash.com/photo-{pid}?w=1600&q=80&fm=jpg&fit=max",
                                         headers={"User-Agent": "unavora-local-dev"})
            with urllib.request.urlopen(req, timeout=60) as r:
                open(f, "wb").write(r.read())

H = {"Authorization": f"Bearer {flow.token('director')}"}


def multipart(url, fields, file_path):
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{os.path.basename(file_path)}\"\r\n"
             "Content-Type: image/jpeg\r\n\r\n").encode()
    body += open(file_path, "rb").read() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


done = 0
for (kind, owner), photos in PLAN.items():
    base = f"{API}/{kind}/{owner}"
    status, detail = flow.http("GET", base, headers=H)
    if status != 200:
        print("skip (not found)", kind, owner)
        continue
    existing = {m.get("credit") for m in detail["media"]}
    for i, (pid, alt) in enumerate(photos):
        credit = f"Unsplash photo-{pid} (https://unsplash.com)"
        if credit in existing:
            continue
        mid = multipart(f"{base}/media", {"kind": "representative", "altEn": alt, "credit": credit, "licence": LICENCE},
                        os.path.join(CACHE, pid + ".jpg"))["id"]
        s, d = flow.http("POST", f"{base}/media/{mid}/approve", headers=H)
        assert s == 200, (s, d)
        if i == 0:
            s, d = flow.http("POST", f"{base}/media/{mid}/primary", headers=H)
            assert s == 200, (s, d)
        done += 1
        print("ok", kind, owner[-4:], pid[:13])
print("uploaded and approved:", done)
