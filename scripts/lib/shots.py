#!/opt/lab/venv/bin/python
"""Capture GHES pages for the workshop guide (runs on the admin workstation, headless Chromium).

  shots.py NAME=PATH [NAME=PATH ...]
    PATH          page path on the appliance, e.g. /contoso/contoso-orders-api/pull/1
    PATH#full     whole page instead of the 1280x800 viewport
    PATH|CSS      only the element matched by the CSS selector (first match)
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

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 800},
                              storage_state=str(STATE) if STATE.exists() else None)
    page = ctx.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle")
    if page.locator("input[name=login]").count():
        page.fill("input[name=login]", USER)
        page.fill("input[name=password]", ENV["GHES_ADMIN_PASS"])
        page.locator("input[type=submit], button[type=submit]").first.click()
        page.wait_for_load_state("networkidle")
    for arg in sys.argv[1:]:
        name, spec = arg.split("=", 1)
        sel = None
        if "|" in spec:
            spec, sel = spec.split("|", 1)
        full = spec.endswith("#full")
        path = spec[:-5] if full else spec
        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(1200)
        out = str(SHOTS / f"{name}.png")
        try:
            if sel:
                loc = page.locator(sel).first
                loc.scroll_into_view_if_needed()
                loc.screenshot(path=out)
            else:
                page.screenshot(path=out, full_page=full)
            print("screenshot", name, page.url)
        except Exception as e:  # keep going: one missing element should not stop the batch
            page.screenshot(path=out)
            print("screenshot", name, "(viewport fallback:", str(e).splitlines()[0][:80], ")")
    ctx.storage_state(path=str(STATE)); os.chmod(STATE, 0o600)
    browser.close()
