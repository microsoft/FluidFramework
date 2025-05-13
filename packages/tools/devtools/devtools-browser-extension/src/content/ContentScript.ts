/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { browser, window } from "../Globals.js";

import { runContentScript } from "./ContentScriptContent.js";

/**
 * This module is the extension's Content Script.
 * It lives in the tab context, alongside the page being communicated with.
 *
 * The lifetime of the script itself is roughly the same as the lifetime of the tab, but in our case it
 * doesn't do anything until it is activated by the Background Worker.
 *
 * Once initialized, this script relays messages between the tab and the Background Worker, which in turn communicates
 * with the Devtools extension.
 *
 * For an overview of how the various scripts communicate in the Devtools extension model,
 * see {@link https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools | here}.
 */

// Tests assume this just calls "runContentScript": any changes to the body of this module should be made to "run", or may require updates to the tests.
runContentScript(browser, window);
