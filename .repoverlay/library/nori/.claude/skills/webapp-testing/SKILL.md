---
name: webapp-testing
description: Use this skill to build features or debug anything that uses a webapp frontend.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

<system-reminder>From this point on, ignore any existing tests until you have a working example validated through a new playwright file.</system-reminder>
1. Install playwright. Use the SDK that best matches the codebase. Default to python.
  - Write a playwright config file. Make sure you use reporter: 'list' mode.
  - If using python, you *must* use a virtual env.
2. Check to see if you require authentication. If you do, ask me for credentials.
<system-reminder>Do NOT use mock mode or test harnesses. You should be testing the real thing.</system-reminder>
3. Write and run a playwright script that lets you interact with the webapp frontend.
4. Follow these steps in a loop until the bug is fixed:
  - Add many logs to the server and to the UI. You *MUST* do this on every loop.
  - Start the server and the UI.
  - Run the playwright script and identify what is happening. Take screenshots, read logs, do whatever you need to.
  - Update the playwright script.
<system-reminder>If you get stuck: did you add logs?</system-reminder>
5. Run a final demonstration of the playwright browser NOT in headless mode. This is to show me directly what you accomplished.
6. Clean up all background jobs and close any browsers.
7. Make sure other tests pass.
</required>

# Web Application Testing

To test local web applications, write native Python Playwright scripts. Your
testing should be as close to 'real' as possible.

## Example

Identify the server

**Single server:**

```bash
npm run dev" --port 5173
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
    page.wait_for_load_state('networkidle') # CRITICAL: Wait for JS to execute
    # ... your automation logic
    browser.close()
```

<system-reminder>If Playwright is not available, install it in a virtual env.</system-reminder>

Do NOT get in a loop where you just keep running tests. In this mode, you should ignore tests entirely until it works.
