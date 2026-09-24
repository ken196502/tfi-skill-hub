#!/usr/bin/env python3
"""Re-PUT detail-html for all skills: images inlined as base64, no SKILL.md link."""
import json, os, sys, base64, urllib.request, urllib.error

BASE = os.environ.get("HUB_BASE", "https://skills.subx.fun")
KEY = os.environ.get("HUB_KEY", "shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE")
MANIFEST = json.load(open("/tmp/skill_cards/manifest.json"))

def put_detail(slug, html):
    req = urllib.request.Request(
        f"{BASE}/api/v1/skills/@admin/{slug}/detail-html",
        data=json.dumps({"html": html}).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="PUT")
    try:
        r = urllib.request.urlopen(req, timeout=60)
        body = json.load(r)
        return r.status, body.get("detailHtml", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def detail_html(s):
    h = []
    h.append("<h2>简介 · Overview</h2>")
    h.append(f"<p>{s['sumZh']}</p>")
    h.append(f"<p><em>{s['sumEn']}</em></p>")
    h.append("<h2>能力亮点 · Highlights</h2><ul>")
    for c in s["caps"]:
        h.append(f"<li>{c}</li>")
    h.append("</ul>")
    h.append(f"<h2>典型场景 · When to use</h2><p>{s['triggers']}</p>")
    h.append(f"<h2>产出与交付 · Outputs</h2><p>{s['outputs']}</p>")
    for card in s.get("cards", []):
        png = base64.b64encode(open(os.path.join(MANIFEST["base"], s["group"], s["slug"], card["file"]), "rb").read()).decode()
        h.append("<h2>案例截图 · Case study</h2>")
        h.append(f"<figure><img src=\"data:image/png;base64,{png}\" alt=\"{card['capZh']}\">"
                 f"<figcaption>{card['capZh']} · {card['capEn']}</figcaption></figure>")
    h.append(f"<blockquote>{s['notes']}</blockquote>")
    return "".join(h)

def main():
    only = sys.argv[1:] or None
    ok, fail = [], []
    for s in MANIFEST["skills"]:
        slug = s["slug"]
        if only and slug not in only:
            continue
        code, stored = put_detail(slug, detail_html(s))
        if code == 200 and ("data:image" in stored or not s.get("cards")):
            ok.append(slug)
            print(f"OK {slug} ({len(stored)} bytes)")
        else:
            fail.append((slug, code, stored[:120]))
            print(f"FAIL {slug}: {code} {stored[:120]}")
    print(f"\nDone. ok={len(ok)} fail={len(fail)}")

if __name__ == "__main__":
    main()
