# LOCAL ONLY: creates illustrative showcase items for reviewing the homepage design, through the same Director CMS API
# a director uses (upload -> malware scan -> licence/alt -> approve -> create item -> publish). Images are the cached
# Unsplash-licensed photos from ../representative-photos/.cache (run load_representative_photos.py first).
# The copy is generic category wording with NO prices, sizes, dates, addresses, developers or availability; in
# production the director writes and approves the real showcase text and images in the CMS.
# Every item is marked is_sample (synthetic data, V19): hidden whenever unavora.public.include-sample-content=false and
# refused at startup by SyntheticDataGuard in any non-local environment. Re-runnable: existing titles are skipped.
#   python infra/local/showcase/load_showcase_demo.py      (API, Postgres, Keycloak running)
import importlib.util, json, os, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("flow", os.path.join(HERE, "..", "scripts", "validate_business_flow.py"))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)

API = "http://localhost:8080/api/v1/staff/cms"
CACHE = os.path.join(HERE, "..", "representative-photos", ".cache")
LICENCE = "Unsplash License (free commercial use, no permission needed)"

ITEMS = [
    ("residential", "1602082550187-3f954840a0f7", "High-rise residential building under a blue sky", "नीले आसमान के नीचे ऊँची आवासीय इमारत",
     "Modern apartment living", "आधुनिक अपार्टमेंट जीवन",
     "Apartments in well-planned towers with daylight, balconies and everyday conveniences close by.",
     "सुनियोजित टावरों में रोशनी, बालकनी और पास में रोज़मर्रा की सुविधाओं वाले अपार्टमेंट।", "enquire"),
    ("villa", "1678575326996-a1bf09b86158", "Villa with large windows and balconies", "बड़ी खिड़कियों और बालकनी वाला विला",
     "Independent villas and houses", "स्वतंत्र विला और मकान",
     "Private homes with room to grow, outdoor space and privacy for the whole family.",
     "पूरे परिवार के लिए खुली जगह, निजता और बढ़ने की गुंजाइश वाले निजी घर।", "enquire"),
    ("commercial", "1758448500688-3ababa93fd67", "Office lobby with a reception desk and plants", "रिसेप्शन डेस्क और पौधों वाली लॉबी",
     "Commercial and retail spaces", "व्यावसायिक और रिटेल स्पेस",
     "Showrooms, shops and business premises for brands that want to be seen.",
     "दिखना चाहने वाले ब्रांडों के लिए शोरूम, दुकानें और व्यावसायिक परिसर।", "enquire"),
    ("office", "1497366754035-f200968a6e72", "Office corridor with glass-panel doors", "कांच के दरवाज़ों वाला ऑफ़िस गलियारा",
     "Office spaces for growing teams", "बढ़ती टीमों के लिए ऑफ़िस स्पेस",
     "Workspaces and office floors for businesses of every size.",
     "हर आकार के व्यवसाय के लिए वर्कस्पेस और ऑफ़िस फ़्लोर।", "browse"),
    ("land", "1697627903173-e22b6e04734d", "Open grassy plot with trees in the background", "पीछे पेड़ों वाला खुला घास का प्लॉट",
     "Plots and land", "प्लॉट और ज़मीन",
     "Residential and investment plots for building your own home or holding land.",
     "अपना घर बनाने या निवेश के लिए आवासीय और निवेश प्लॉट।", "enquire"),
    ("project_style", "1675252003305-93cd1b03d8b4", "Pair of residential towers", "आवासीय टावरों की जोड़ी",
     "New residential developments", "नई आवासीय परियोजनाएँ",
     "Contemporary towers and gated communities. Approved launches appear under New launches.",
     "आधुनिक टावर और गेटेड सोसायटी। स्वीकृत लॉन्च “नए लॉन्च” में दिखते हैं।", "register_interest"),
    # more project styles for the New launches carousel (shown only while no real launch is published)
    ("project_style", "1683402967722-917fdd774f30", "Walkway between residential towers with balconies", "बालकनी वाले आवासीय टावरों के बीच रास्ता",
     "Gated residential communities", "गेटेड आवासीय सोसायटी",
     "Landscaped communities with shared open spaces and everyday amenities.",
     "साझा खुली जगह और रोज़मर्रा की सुविधाओं वाली हरी-भरी सोसायटी।", "register_interest"),
    ("project_style", "1624204386084-dd8c05e32226", "Apartment building with glass balconies at dusk", "शाम के समय कांच की बालकनी वाली अपार्टमेंट इमारत",
     "High-rise apartment towers", "ऊँचे अपार्टमेंट टावर",
     "Vertical living with views, balconies and modern building services.",
     "नज़ारों, बालकनी और आधुनिक भवन सेवाओं के साथ ऊँचाई पर रहना।", "register_interest"),
    ("project_style", "1460317442991-0ec209397118", "Low-angle view of a modern apartment building", "आधुनिक अपार्टमेंट इमारत का नीचे से दृश्य",
     "Mid-rise residential blocks", "मध्यम ऊँचाई की आवासीय इमारतें",
     "Compact residential blocks close to schools, offices and markets.",
     "स्कूल, दफ़्तर और बाज़ार के पास छोटे आवासीय ब्लॉक।", "register_interest"),
]

H = {"Authorization": f"Bearer {flow.token('director')}"}


def call(method, url, body=None):
    s, d = flow.http(method, url, body=body, headers=H)
    assert s in (200, 201), (method, url, s, d)
    return d


def upload(path, fields):
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode() + v.encode("utf-8") + b"\r\n"
    body += (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{os.path.basename(path)}\"\r\n"
             "Content-Type: image/jpeg\r\n\r\n").encode() + open(path, "rb").read() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"{API}/media", data=body, method="POST", headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["id"]


existing = {i["titleEn"] for i in call("GET", f"{API}/showcase")}
for n, (cat, pid, alt_en, alt_hi, t_en, t_hi, d_en, d_hi, cta) in enumerate(ITEMS):
    if t_en in existing:
        print("skip", t_en)
        continue
    mid = upload(os.path.join(CACHE, pid + ".jpg"), {"kind": "representative", "altEn": alt_en, "altHi": alt_hi,
                                                     "credit": f"Unsplash photo-{pid}", "licence": LICENCE})
    call("POST", f"{API}/media/{mid}/approve")
    item = call("POST", f"{API}/showcase", {"category": cat, "titleEn": t_en, "titleHi": t_hi, "descriptionEn": d_en,
                                            "descriptionHi": d_hi, "imageMediaId": mid, "cta": cta, "sortOrder": n})
    call("POST", f"{API}/showcase/{item['id']}/publish")
    print("published", cat, t_en)

# mark ALL demo items (also ones created by earlier runs) as local sample data
titles = ",".join("'" + i[4].replace("'", "''") + "'" for i in ITEMS)
flow.sql(f"UPDATE showcase_items SET is_sample = true WHERE title_en IN ({titles})")
print("marked as local sample data:", flow.sql(f"SELECT count(*) FROM showcase_items WHERE is_sample AND title_en IN ({titles})"))
