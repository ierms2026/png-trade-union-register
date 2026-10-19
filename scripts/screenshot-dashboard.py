"""Log in as registrar@example.com + screenshot the dashboard.

Logs in via the /api/auth/login endpoint, captures the session cookie,
then navigates to /?view=dashboard + takes a full-page screenshot.
"""
import asyncio
import json
import urllib.request
import urllib.error
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
LOGIN_URL = f"{BASE}/api/auth/login"
EMAIL = "registrar@example.com"
PASSWORD = "Test!2345abc"
DASHBOARD_URL = f"{BASE}/?view=dashboard"
OUT = "/home/z/my-project/upload/dashboard-before.png"

# Step 1: log in via HTTP to get the session cookie (Playwright can also
# do this, but doing it via urllib first lets us verify the login worked
# before spinning up the browser).
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
            # The session cookie is in the Set-Cookie header.
            cookies = resp.headers.get_all("Set-Cookie") or []
            for c in cookies:
                if "session=" in c:
                    # Extract just the session=... part (before the first ;)
                    return c.split(";")[0]
            print("No session cookie in response headers:")
            for c in cookies:
                print(f"  {c}")
            return None
    except urllib.error.HTTPError as e:
        print(f"Login failed: HTTP {e.code} - {e.read().decode()[:300]}")
        return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

async def main():
    print(f"Logging in as {EMAIL}...")
    cookie = login()
    if not cookie:
        print("Login failed — aborting screenshot.")
        return False

    print(f"Got session cookie: {cookie[:30]}...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 2200},  # tall viewport to capture the full dashboard
            device_scale_factor=2,
        )
        # Set the session cookie
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
        # Wait for client-side data fetches to settle (dashboard has 5 parallel fetches)
        await page.wait_for_timeout(5000)
        print("Taking full-page screenshot...")
        await page.screenshot(path=OUT, full_page=True)
        print(f"Screenshot saved to {OUT}")
        await browser.close()
    return True

if __name__ == "__main__":
    ok = asyncio.run(main())
    print("SUCCESS" if ok else "FAILED")
