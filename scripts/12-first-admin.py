#!/opt/lab/venv/bin/python
"""Step 12 (workstation): create the first site administrator on GHES, sign in, and create that administrator's
personal access token (classic) for the lab automation. A screenshot of each screen goes to /opt/lab/shots.

GHES has no API for the very first user, so this drives the web UI with headless Chromium (Playwright).
From Cloud Shell:  source lib/ws.sh && ws "/opt/lab/venv/bin/python 12-first-admin.py"
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
HOST = ENV["GHES_HOST"]
USER = os.environ.get("GHES_ADMIN", "ibranibeny")
EMAIL = os.environ.get("GHES_ADMIN_EMAIL", "ibranibeny@contoso.com")
PASSWORD = ENV["GHES_ADMIN_PASS"]
BASE = f"https://{HOST}"
SHOTS = pathlib.Path("/opt/lab/shots"); SHOTS.mkdir(parents=True, exist_ok=True)
STATE = LAB / "browser-state.json"


def shot(page, name, full=False):
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)
    print("screenshot", name)


def fill_first(page, selectors, value):
    for sel in selectors:
        loc = page.locator(sel)
        if loc.count():
            loc.first.fill(value)
            return True
    return False


def dump_inputs(page):
    names = page.eval_on_selector_all("input,select,button", "els => els.map(e => `${e.tagName}:${e.name||''}:${e.type||''}:${(e.innerText||e.value||'').slice(0,30)}`)")
    print("form fields on", page.url, "\n ", "\n  ".join(names[:60]))


def sign_in(page):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    if page.locator("input[name=login]").count():
        page.fill("input[name=login]", USER)
        page.fill("input[name=password]", PASSWORD)
        page.locator("form:has(input[name=login]) [type=submit]").first.click()
        page.wait_for_load_state("networkidle")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 800})
    page = ctx.new_page()

    # 1. first administrator account (the appliance shows this page until a user exists)
    page.goto(f"{BASE}/join", wait_until="networkidle")
    if page.locator("input[name='user[login]']").count():
        fill_first(page, ["input[name='user[login]']"], USER)
        fill_first(page, ["input[name='user[email]']"], EMAIL)
        fill_first(page, ["input[name='user[password]']"], PASSWORD)
        fill_first(page, ["input[name='user[password_confirmation]']"], PASSWORD)
        shot(page, "12-01-create-first-admin")
        page.locator("form:has(input[name='user[login]']) [type=submit]").first.click()
        page.wait_for_load_state("networkidle")
        print("first administrator created:", USER, "->", page.url)
    else:
        print("first administrator already exists (", page.url, ")")
    sign_in(page)
    page.goto(BASE, wait_until="networkidle")
    shot(page, "12-02-ghes-dashboard")

    # 2. personal access token (classic) for the lab automation
    if (LAB / "ghes-token").exists() and (LAB / "ghes-token").read_text().strip():
        print("token already present, skipping")
    else:
        page.goto(f"{BASE}/settings/tokens/new", wait_until="networkidle")
        if page.locator("input[name=sudo_password], input#sudo_password").count():  # sudo mode
            fill_first(page, ["input[name=sudo_password]", "input#sudo_password"], PASSWORD)
            page.locator("form:has(input[name=sudo_password]) [type=submit], form:has(#sudo_password) [type=submit]").first.click()
            page.wait_for_load_state("networkidle")
        if not fill_first(page, ["input[name='oauth_access[description]']", "input#oauth_access_description"], "ai-review-lab automation"):
            dump_inputs(page); sys.exit("token form not found")
        sel = page.locator("select[name='oauth_access[default_expires_at]'], select#oauth_access_default_expires_at")
        if sel.count():
            try:
                sel.first.select_option("30")
            except Exception:
                pass
        for scope in ("repo", "workflow", "admin:org", "site_admin", "admin:repo_hook"):
            box = page.locator(f"input[type=checkbox][value='{scope}']")
            if box.count() and not box.first.is_checked():
                box.first.check()
        shot(page, "12-03-token-scopes", full=True)
        page.locator("button[type=submit]:has-text('Generate token'), input[type=submit][value*='Generate']").first.click()
        page.wait_for_load_state("networkidle")
        m = re.search(r"gh[pousr]_[A-Za-z0-9]{30,}", page.content())
        if not m:
            dump_inputs(page); sys.exit("token not found on the page")
        tok = LAB / "ghes-token"
        tok.write_text(m.group(0)); tok.chmod(0o600)
        print("token saved to", tok, "(", m.group(0)[:4] + "..." + ")")
    ctx.storage_state(path=str(STATE))
    os.chmod(STATE, 0o600)
    browser.close()
print("STEP 12 DONE")
