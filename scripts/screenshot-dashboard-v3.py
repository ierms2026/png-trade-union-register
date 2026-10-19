"""Start server, log in, fetch dashboard HTML to verify, then screenshot.

All in one process — the server stays alive because we never yield back
to the shell between requests.
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
EMAIL = "registrar@example.com"
PASSWORD = "Test!2345abc"
DASHBOARD_URL = f"{BASE}/?view=dashboard"
OUT = "/home/z/my-project/upload/dashboard-after.png"
PROJECT = "/home/z/my-project"

def start_server() -> subprocess.Popen:
    env = os.environ.copy()
    env["SESSION_SECRET"] = "a" * 64
    env["DEMO_PASSWORD"] = "Test!2345abc"
    env["CRON_SECRET"] = "b" * 64
    env["NODE_ENV"] = "production"
    proc = subprocess.Popen(
        ["bun", ".next/standalone/server.js"],
        cwd=PROJECT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
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
    return False

def login_and_verify() -> tuple[str | None, bool]:
    """Log in, return (cookie, is_dashboard_rendered)."""
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Login: {resp.status}")
            cookies = resp.headers.get_all("Set-Cookie") or []
            cookie = None
            for c in cookies:
                if "session=" in c or "urm_session=" in c:
                    cookie = c.split(";")[0]
                    break
            if not cookie:
                print("No session cookie in login response")
                return None, False
            print(f"Cookie: {cookie[:40]}...")
            # Verify the dashboard renders with this cookie
            req2 = urllib.request.Request(DASHBOARD_URL)
            req2.add_header("Cookie", cookie)
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                html = resp2.read().decode()
                # The dashboard view is rendered server-side ONLY if authenticated.
                # Check for dashboard-specific markers in the HTML.
                has_kpi = "kpi-band" in html or "Total Unions" in html
                has_dashboard_h1 = ">Dashboard<" in html
                has_quick_actions = "quick-actions" in html
                print(f"  HTML length: {len(html)}")
                print(f"  has 'kpi-band' / 'Total Unions': {has_kpi}")
                print(f"  has '>Dashboard<' h1: {has_dashboard_h1}")
                print(f"  has 'quick-actions': {has_quick_actions}")
                is_dash = has_kpi or has_dashboard_h1 or has_quick_actions
                return cookie, is_dash
    except Exception as e:
        print(f"Login/verify error: {e}")
        return None, False

async def screenshot(cookie: str) -> bool:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 2200},
            device_scale_factor=2,
        )
        # Parse the cookie name + value
        name, value = cookie.split("=", 1)
        await context.add_cookies([{
            "name": name,
            "value": value,
            "domain": "127.0.0.1",
            "path": "/",
            "httpOnly": True,
            "secure": False,
            "sameSite": "Lax",
        }])
        page = await context.new_page()
        print(f"Navigating to {DASHBOARD_URL}...")
        response = await page.goto(DASHBOARD_URL, wait_until="networkidle", timeout=30000)
        print(f"Response: {response.status if response else 'no response'}")
        # Verify the dashboard rendered by checking the page content
        content = await page.content()
        has_kpi = "kpi-band" in content or "Total Unions" in content
        print(f"  Playwright sees 'kpi-band' / 'Total Unions': {has_kpi}")
        await page.wait_for_timeout(6000)
        print("Taking full-page screenshot...")
        await page.screenshot(path=OUT, full_page=True)
        print(f"Screenshot saved to {OUT}")
        await browser.close()
    return True

def main():
    proc = start_server()
    try:
        if not wait_for_server():
            print("Server didn't start.")
            return 1
        cookie, is_dash = login_and_verify()
        if not cookie:
            print("Login failed.")
            return 1
        if not is_dash:
            print("WARNING: dashboard didn't render server-side — cookie may not be sticking.")
        asyncio.run(screenshot(cookie))
        return 0
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            pass

if __name__ == "__main__":
    sys.exit(main())
