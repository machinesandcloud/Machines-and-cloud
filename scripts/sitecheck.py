import re, os, sys, glob
from urllib.parse import urlparse
from html.parser import HTMLParser
root = sys.argv[1]
os.chdir(root)
html = sorted(glob.glob("*.html"))
noindex = {f for f in html if re.search(r'name="robots" content="noindex', open(f, encoding="utf-8", errors="replace").read())}
print(f"noindex pages (excluded from sitemap/redirect/canonical checks): {sorted(noindex)}")
files = set(os.listdir(".")) | {os.path.join(base, name) for base, _, names in os.walk("assets") for name in names}
class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        self.refs.extend(value for name, value in attrs if name in ("href", "src") and value)
broken = {}
for f in html:
    s = open(f, encoding="utf-8", errors="replace").read()
    parsed = References()
    parsed.feed(s)
    for m in parsed.refs:
        if m.startswith(("http", "mailto:", "tel:", "data:", "//")): continue
        m = urlparse(m).path
        if m.startswith("/"): m = m[1:]
        if m and m not in files:
            broken.setdefault(m, []).append(f)
print(f"HTML pages: {len(html)}")
print(f"Broken local refs: {len(broken)}")
for k,v in sorted(broken.items())[:20]:
    print(f"  {k}  <- {len(v)} page(s), e.g. {v[0]}")
sm = open("sitemap.xml").read()
urls = re.findall(r"<loc>(.*?)</loc>", sm)
sm_paths = {urlparse(u).path.lstrip("/") or "index.html" for u in urls}
print(f"\nSitemap URLs: {len(urls)}")
missing_file = sorted(p for p in sm_paths if p not in files)
not_in_sitemap = sorted(h for h in html if h not in sm_paths and h not in noindex)
print(f"Sitemap entries w/o file: {len(missing_file)} {missing_file[:10]}")
print(f"HTML pages not in sitemap: {len(not_in_sitemap)} {not_in_sitemap[:15]}")
rd = open("_redirects").read()
rd_src = re.findall(r"^(/\S+)\s", rd, re.M)
print(f"\n_redirects rules: {len(rd_src)}")
noredir = sorted(h for h in html if "/"+h[:-5] not in rd_src and h!="index.html" and h not in noindex)
print(f"HTML pages lacking extensionless redirect: {len(noredir)} {noredir[:10]}")
bad_canon = []
for f in html:
    if f in noindex: continue
    s = open(f, encoding="utf-8", errors="replace").read()
    c = re.search(r'rel="canonical" href="([^"]+)"', s)
    exp = "https://www.machinesandcloud.com/" + ("" if f=="index.html" else f)
    if not c: bad_canon.append((f,"MISSING"))
    elif c.group(1)!=exp: bad_canon.append((f,c.group(1)))
print(f"\nCanonical mismatches: {len(bad_canon)} {bad_canon[:8]}")
sys.exit(bool(broken or missing_file or not_in_sitemap or noredir or bad_canon))
