"""Take a screenshot of the redesigned portal using Playwright (Python).

The agent-browser CLI couldn't reach localhost (network isolation), but
Playwright via Python should work because it runs in the same network
namespace as curl.
"""
import asyncio
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:3000/"
OUT = "/home/z/my-project/upload/redesigned-portal.png"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,  # retina-quality screenshot
        )
        page = await context.new_page()
        print(f"Navigating to {URL}...")
        response = await page.goto(URL, wait_until="networkidle", timeout=30000)
        print(f"Response status: {response.status if response else 'no response'}")
        # Extra wait for any client-side data fetches to settle
        await page.wait_for_timeout(3000)
        print("Taking full-page screenshot...")
        await page.screenshot(path=OUT, full_page=True)
        print(f"Screenshot saved to {OUT}")
        await browser.close()

asyncio.run(main())
