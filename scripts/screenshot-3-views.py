"""Screenshot all 3 high-traffic views in one process.

Starts the server ONCE, logs in ONCE, then navigates to each view +
takes a screenshot. The server stays alive across all 3 screenshots.
"""
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "registrar@example.com"
PASSWORD = "Test!2345abc"
PROJECT = "/home/z/my-project"

# The 3 views to screenshot. The unions detail view needs a union ID —
# we'll fetch it from /api/unions after login.
VIEWS = [
    ("compliance", "/?view=compliance"),
    ("documents", "/?view=documents"),
    # unions detail — placeholder, will be set after fetching union ID
    ("unions-detail", None),  # None = fetch union ID first
]

def start_server():
    env = os.environ.copy()
    env.update({
        "SESSION_SECRET": "a" * 64,
        "DEMO_PASSWORD": "Test!2345abc",
        "CRON_SECRET": "b" * 64,
        "NODE_ENV": "production",
    })
    proc = subprocess.Popen(
        ["bun", ".next/standalone/server.js"],
        cwd=PROJECT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        preexec_fn=os.setsid,
    )
    print(f"Server pid={proc.pid}")
    return proc

def wait_for_server(timeout=15):
    for i in range(timeout):
        try:
            with urllib.request.urlopen(BASE, timeout=2) as r:
                if r.status == 200:
                    print(f"Server up after {i}s")
                    return True
        except:
            time.sleep(1)
    return False

def login():
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        for c in resp.headers.get_all("Set-Cookie") or []:
            if "session=" in c or "urm_session=" in c:
                return c.split(";")[0]
    return None

def get_first_union_id(cookie):
    req = urllib.request.Request(f"{BASE}/api/unions")
    req.add_header("Cookie", cookie)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
        if data.get("unions") and len(data["unions"]) > 0:
            return data["unions"][0]["id"]
    return None

async def screenshot_all(cookie, views):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 2400},
            device_scale_factor=2,
        )
        name, value = cookie.split("=", 1)
        await context.add_cookies([{
            "name": name, "value": value,
            "domain": "127.0.0.1", "path": "/",
            "httpOnly": True, "secure": False, "sameSite": "Lax",
        }])
        page = await context.new_page()

        for view_name, url_path in views:
            if url_path is None:
                # Fetch union ID for the unions-detail view
                union_id = get_first_union_id(cookie)
                if not union_id:
                    print(f"SKIP {view_name} — no union ID")
                    continue
                url_path = f"/?view=unions&union={union_id}"

            full_url = f"{BASE}{url_path}"
            out = f"/home/z/my-project/upload/view-after-{view_name}.png"
            print(f"  {view_name}: {url_path}")
            response = await page.goto(full_url, wait_until="networkidle", timeout=30000)
            print(f"    response: {response.status if response else 'no response'}")
            await page.wait_for_timeout(5000)
            await page.screenshot(path=out, full_page=True)
            print(f"    saved: {out}")

        await browser.close()

def main():
    proc = start_server()
    try:
        if not wait_for_server():
            print("Server didn't start.")
            return 1
        cookie = login()
        if not cookie:
            print("Login failed.")
            return 1
        print(f"Logged in. Cookie: {cookie[:30]}...")
        asyncio.run(screenshot_all(cookie, VIEWS))
        print("Done — all 3 views screenshotted.")
        return 0
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            print("Server killed.")
        except:
            pass

if __name__ == "__main__":
    sys.exit(main())
