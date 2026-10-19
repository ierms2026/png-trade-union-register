"""Screenshot any authenticated view by URL.

Usage: python screenshot-view.py <view_name> <url_path>
Example: python screenshot-view.py compliance /?view=compliance

Starts the prod server, logs in as registrar, navigates to the URL,
takes a full-page screenshot, kills the server.
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

def start_server() -> subprocess.Popen:
    env = os.environ.copy()
    env["SESSION_SECRET"] = "a" * 64
    env["DEMO_PASSWORD"] = "Test!2345abc"
    env["CRON_SECRET"] = "b" * 64
    env["NODE_ENV"] = "production"
    proc = subprocess.Popen(
        ["bun", ".next/standalone/server.js"],
        cwd=PROJECT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        preexec_fn=os.setsid,
    )
    return proc

def wait_for_server(timeout=15) -> bool:
    for i in range(timeout):
        try:
            with urllib.request.urlopen(BASE, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False

def login() -> str | None:
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            for c in resp.headers.get_all("Set-Cookie") or []:
                if "session=" in c or "urm_session=" in c:
                    return c.split(";")[0]
    except Exception as e:
        print(f"Login error: {e}")
    return None

async def screenshot(cookie: str, url: str, out_path: str):
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
        full_url = f"{BASE}{url}"
        print(f"Navigating to {full_url}...")
        response = await page.goto(full_url, wait_until="networkidle", timeout=30000)
        print(f"Response: {response.status if response else 'no response'}")
        await page.wait_for_timeout(5000)
        await page.screenshot(path=out_path, full_page=True)
        print(f"Screenshot saved to {out_path}")
        await browser.close()

def main():
    if len(sys.argv) < 3:
        print("Usage: python screenshot-view.py <name> <url_path>")
        print("Example: python screenshot-view.py compliance /?view=compliance")
        sys.exit(1)
    name = sys.argv[1]
    url = sys.argv[2]
    out = f"/home/z/my-project/upload/view-{name}.png"

    proc = start_server()
    try:
        if not wait_for_server():
            print("Server didn't start.")
            return 1
        cookie = login()
        if not cookie:
            print("Login failed.")
            return 1
        asyncio.run(screenshot(cookie, url, out))
        return 0
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            pass

if __name__ == "__main__":
    sys.exit(main())
