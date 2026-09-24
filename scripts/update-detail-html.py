#!/usr/bin/env python3
"""Re-PUT detail-html for all skills, bilingual.

Writes BOTH detail columns in one call: `html` (Chinese body) and `htmlEn`
(English body). Each page is generated in a single language — the site renders
whichever matches the current language setting and falls back to Chinese when
the English body is absent. No version bumps involved.
"""
import json, os, sys, base64, urllib.request, urllib.error

BASE = os.environ.get("HUB_BASE", "https://skills.subx.fun")
KEY = os.environ.get("HUB_KEY", "shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE")
MANIFEST = json.load(open("/tmp/skill_cards/manifest_full.json"))

def put_detail(slug, payload):
    req = urllib.request.Request(
        f"{BASE}/api/v1/skills/@admin/{slug}/detail-html",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="PUT")
    try:
        r = urllib.request.urlopen(req, timeout=60)
        body = json.load(r)
        return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()}

def body_html(s, lang):
    zh = lang == "zh"
    caps = s["caps"] if zh else s["capsEn"]
    triggers = s["triggers"] if zh else s["triggersEn"]
    outputs = s["outputs"] if zh else s["outputsEn"]
    notes = s["notes"] if zh else s["notesEn"]
    h = []
    h.append(f"<h2>{'简介' if zh else 'Overview'}</h2>")
    h.append(f"<p>{s['sumZh'] if zh else s['sumEn']}</p>")
    h.append(f"<h2>{'能力亮点' if zh else 'Highlights'}</h2><ul>")
    h.extend(f"<li>{c}</li>" for c in caps)
    h.append("</ul>")
    h.append(f"<h2>{'典型场景' if zh else 'When to use'}</h2><p>{triggers}</p>")
    h.append(f"<h2>{'产出与交付' if zh else 'Outputs'}</h2><p>{outputs}</p>")
    for card in s.get("cards", []):
        png = base64.b64encode(open(os.path.join(MANIFEST["base"], s["group"], s["slug"], card["file"]), "rb").read()).decode()
        cap = card["capZh"] if zh else card["capEn"]
        h.append(f"<h2>{'案例截图' if zh else 'Case study'}</h2>")
        h.append(f"<figure><img src=\"data:image/png;base64,{png}\" alt=\"{cap}\">"
                 f"<figcaption>{cap}</figcaption></figure>")
    h.append(f"<blockquote>{notes}</blockquote>")
    return "".join(h)

def main():
    only = sys.argv[1:] or None
    ok, fail = [], []
    for s in MANIFEST["skills"]:
        slug = s["slug"]
        if only and slug not in only:
            continue
        payload = {"html": body_html(s, "zh"), "htmlEn": body_html(s, "en")}
        code, body = put_detail(slug, payload)
        zh, en = body.get("detailHtml", ""), body.get("detailHtmlEn", "")
        if code == 200 and zh and en:
            ok.append(slug)
            print(f"OK {slug} (zh {len(zh)}b / en {len(en)}b)")
        else:
            fail.append((slug, code, str(body)[:120]))
            print(f"FAIL {slug}: {code} {str(body)[:120]}")
    print(f"\nDone. ok={len(ok)} fail={len(fail)}")
    for f in fail:
        print("FAILED:", f)

if __name__ == "__main__":
    main()
