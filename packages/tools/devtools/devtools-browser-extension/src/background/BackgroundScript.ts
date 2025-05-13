/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { browser } from "../Globals.js";

import { runBackgroundScript } from "./BackgroundScriptContent.js";

/**
 * This script runs as the extension's Background Worker.
 * It has no direct access to the page or any of its resources.
 * It runs automatically in the background, and only a single instance is run by the browser, regardless of how
 * many open tabs are running the extension (i.e. how many instances of the extension's DevtoolsScript are running).
 *
 * While the script itself runs as soon as the Browser is launched (post installation), it will not begin relaying
 * any messages until the Devtools Script sends it a connection request. After connecting, the Devtools Script
 * is required to provide the `tabID` of the webpage it is inspecting. From that point forward, this script
 * relays messages between the webpage (via our injected Content Script), and the Devtools Script.
 *
 * For an overview of how the various scripts communicate in the Devtools extension model,
 * see {@link https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools | here}.
 */

// Tests assume this just calls "runBackgroundScript": any changes to the body of this module should be made to "run", or may require updates to the tests.
runBackgroundScript(browser);
