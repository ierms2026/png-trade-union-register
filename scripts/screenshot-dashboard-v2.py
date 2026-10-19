"""Start the prod server as a subprocess, wait for it, log in, screenshot, kill.

Runs everything in one Python process so the server can't die silently
between Bash calls.
"""
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
LOGIN_URL = f"{BASE}/api/auth/login"
EMAIL = "registrar@example.com"
PASSWORD = "Test!2345abc"
DASHBOARD_URL = f"{BASE}/?view=dashboard"
OUT = "/home/z/my-project/upload/dashboard-before.png"
PROJECT = "/home/z/my-project"

def start_server() -> subprocess.Popen:
    env = os.environ.copy()
    env["SESSION_SECRET"] = "a" * 64
    env["DEMO_PASSWORD"] = "Test!2345abc"
    env["CRON_SECRET"] = "b" * 64
    env["NODE_ENV"] = "production"
    # Start the standalone server (bun is faster + more stable than node for this)
    proc = subprocess.Popen(
        ["bun", ".next/standalone/server.js"],
        cwd=PROJECT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        # Put the server in its own process group so we can kill it cleanly
        preexec_fn=os.setsid,
    )
    print(f"Server started, pid={proc.pid}")
    return proc

def wait_for_server(timeout=20) -> bool:
    for i in range(timeout):
        try:
            req = urllib.request.Request(BASE, method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    print(f"Server up after {i}s")
                    return True
        except Exception:
            time.sleep(1)
    print(f"Server not up after {timeout}s")
    return False

def login() -> str | None:
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        LOGIN_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Login response: {resp.status}")
            cookies = resp.headers.get_all("Set-Cookie") or []
            for c in cookies:
                if "session=" in c:
                    return c.split(";")[0]
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

async def screenshot(cookie: str) -> bool:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 2200},
            device_scale_factor=2,
        )
        await context.add_cookies([{
            "name": "session",
            "value": cookie.split("=", 1)[1],
            "domain": "127.0.0.1",
            "path": "/",
            "httpOnly": True,
            "secure": False,
            "sameSite": "Lax",
        }])
        page = await context.new_page()
        print(f"Navigating to {DASHBOARD_URL}...")
        response = await page.goto(DASHBOARD_URL, wait_until="networkidle", timeout=30000)
        print(f"Response status: {response.status if response else 'no response'}")
        await page.wait_for_timeout(6000)  # let 5 parallel fetches settle
        print("Taking full-page screenshot...")
        await page.screenshot(path=OUT, full_page=True)
        print(f"Screenshot saved to {OUT}")
        await browser.close()
    return True

def main():
    proc = start_server()
    try:
        if not wait_for_server():
            return 1
        cookie = login()
        if not cookie:
            print("Login failed.")
            return 1
        print(f"Got cookie: {cookie[:30]}...")
        asyncio.run(screenshot(cookie))
        return 0
    finally:
        # Kill the whole process group (server + any children)
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            print(f"Server (pid={proc.pid}) killed.")
        except Exception as e:
            print(f"Kill error: {e}")

if __name__ == "__main__":
    sys.exit(main())
