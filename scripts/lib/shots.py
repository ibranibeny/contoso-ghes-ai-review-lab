#!/opt/lab/venv/bin/python
"""Capture GHES pages for the workshop guide (runs on the admin workstation, headless Chromium).

  shots.py NAME=PATH [NAME=PATH ...]
    PATH          page path on the appliance, e.g. /contoso/contoso-orders-api/pull/1
    PATH#full     whole page instead of the 1280x800 viewport
    PATH|CSS      only the element matched by the CSS selector (first match)
    PATH~T1;T2~H  the block around the first visible text T1 (or T2 ...), grown to an ancestor at least H px tall;
                  prefix a text with last: to use its last occurrence on the page
Screenshots go to /opt/lab/shots/NAME.png. The browser session from step 12 is reused (or signs in again).
"""
import os, re, sys, pathlib
from playwright.sync_api import sync_playwright

LAB = pathlib.Path(os.environ.get("LAB", "/root/.ghes-lab"))
ENV = {}
for f in ("secrets.env", "lab.env"):
    for line in (LAB / f).read_text().splitlines():
        m = re.match(r"export (\w+)='(.*)'$", line.strip())
        if m:
            ENV[m.group(1)] = m.group(2)
BASE = f"https://{ENV['GHES_HOST']}"
USER = os.environ.get("GHES_ADMIN", "ibranibeny")
SHOTS = pathlib.Path("/opt/lab/shots"); SHOTS.mkdir(parents=True, exist_ok=True)
STATE = LAB / "browser-state.json"

ANCHOR_JS = """([texts, minh]) => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const all = [...document.querySelectorAll('body *')];
  for (const raw of texts) {
    const last = raw.startsWith('last:'), t = raw.replace(/^last:/, '');
    const el = (last ? [...all].reverse() : all).find(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.includes(t)));
    if (!el) continue;
    let n = el;
    while (n.parentElement && n.getBoundingClientRect().height < minh) n = n.parentElement;
    const r = n.getBoundingClientRect();
    const W = document.documentElement.scrollWidth;
    const x = Math.max(0, r.left + window.scrollX - 12), y = Math.max(0, r.top + window.scrollY - 12);
    return {x, y, width: Math.min(r.width + 24, W - x), height: Math.min(r.height + 24, 1500), text: t};
  }
  return null;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 800},
                              storage_state=str(STATE) if STATE.exists() else None)
    page = ctx.new_page()
    page.set_default_timeout(60_000)

    def settle(ms=1500):  # GHES keeps live connections open: wait for "load", never for network idle
        try:
            page.wait_for_load_state("load", timeout=60_000)
        except Exception:
            pass
        page.wait_for_timeout(ms)

    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=90_000); settle()
    if page.locator("input[name=login]").count():
        page.fill("input[name=login]", USER)
        page.fill("input[name=password]", ENV["GHES_ADMIN_PASS"])
        page.locator("form:has(input[name=login]) [type=submit]").first.click()
        settle(3000)
    for arg in sys.argv[1:]:
        name, spec = arg.split("=", 1)
        sel = anchor = None
        minh = 180
        if "~" in spec:
            parts = spec.split("~")
            spec, anchor = parts[0], parts[1].split(";")
            minh = int(parts[2]) if len(parts) > 2 and parts[2] else minh
        if "|" in spec:
            spec, sel = spec.split("|", 1)
        full = spec.endswith("#full")
        path = spec[:-5] if full else spec
        page.goto(BASE + path, wait_until="domcontentloaded", timeout=90_000)
        settle(2500)
        out = str(SHOTS / f"{name}.png")
        try:
            if anchor:
                box = page.evaluate(ANCHOR_JS, [anchor, minh])
                if not box:
                    raise RuntimeError(f"text not found: {anchor}")
                page.screenshot(path=out, full_page=True, clip={k: box[k] for k in ("x", "y", "width", "height")})
                print("screenshot", name, "around", repr(box["text"]), f"{int(box['width'])}x{int(box['height'])}")
                continue
            if sel:
                loc = page.locator(sel).first
                loc.scroll_into_view_if_needed()
                loc.screenshot(path=out)
            else:
                page.screenshot(path=out, full_page=full)
            print("screenshot", name, page.url)
        except Exception as e:  # keep going: one missing element should not stop the batch
            if anchor:
                print("screenshot", name, "skipped:", str(e).splitlines()[0][:100])
                continue
            page.screenshot(path=out)
            print("screenshot", name, "(viewport fallback:", str(e).splitlines()[0][:80], ")")
    ctx.storage_state(path=str(STATE)); os.chmod(STATE, 0o600)
    browser.close()
