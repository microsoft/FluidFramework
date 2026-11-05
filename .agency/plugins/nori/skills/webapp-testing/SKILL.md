---
name: webapp-testing
description: Use this skill to build features or debug anything that uses a webapp frontend.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

1. Read the existing browser tests and use the repository's Playwright configuration, language, and package manager.
  - Reuse the installed tooling and fixtures before adding a standalone script or another SDK.
  - Restore dependencies or browsers only when the selected check reports they are missing.
  - If a separate Python script is necessary, use a virtual environment.
2. Check whether authentication is required. Use an approved session or ask the user to sign in through the supported runtime flow.
   Never ask for credentials in chat or copy credential-bearing files from another worktree.
<system-reminder>Do NOT use mock mode or test harnesses. You should be testing the real thing.</system-reminder>
3. Write and run a playwright script that lets you interact with the webapp frontend.
4. Follow these steps in a loop until the bug is fixed:
  - Add targeted, non-sensitive diagnostics when needed.
  - Reuse or start the server and UI, and verify readiness before testing.
  - Run the playwright script and identify what is happening. Take screenshots, read logs, do whatever you need to.
  - Update the playwright script.
<system-reminder>If you get stuck: did you add logs?</system-reminder>
5. Capture a screenshot or use a supported browser preview to show the result.
   Use a headed browser only when the runtime supports it and a demonstration is needed; CI and remote hosts may require headless mode.
6. Clean up all background jobs and close any browsers.
7. Make sure other tests pass.
</required>

# Web Application Testing

Test local web applications with the existing Playwright suite when possible.
Use a standalone script only when the suite cannot reproduce the behavior.

## Example

Identify the server

**Single server:**

```bash
pnpm run dev --port 5173
```

**Multiple servers (e.g., backend + frontend):**

```bash
cd backend && python server.py&
cd frontend && npm run dev&
```

To create an automation script, include only Playwright logic

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.get_by_role('main').wait_for() # Wait for the application's ready state
    # ... your automation logic
    browser.close()
```

Wait for a specific application-ready element or assertion, not a generic network-idle state.
After the reproduction passes, run the relevant regression tests.
