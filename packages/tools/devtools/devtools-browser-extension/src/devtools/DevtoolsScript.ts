/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { browser } from "../Globals.js";

import { runDevtoolsScript } from "./DevtoolsScriptContent.js";

/**
 * This module is the extension's Devtools Script.
 * It runs in the context of the browser's Devtools panel, and has no direct access to the page or any of its resources.
 * It is initialized as soon as a user clicks on this extension's tab in the Devtools panel.
 * It will live for as long at the extension's tab is active.
 *
 * From an implementation perspective, this script simply initializes our React view.
 * That view then handles initiating communication between the Devtools extension and the webpage (via the shared
 * Background Worker).
 *
 * For an overview of how the various scripts communicate in the Devtools extension model,
 * see {@link https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools | here}.
 */

// Tests assume this just calls "runDevtoolsScript": any changes to the body of this module should be made to "run", or may require updates to the tests.
runDevtoolsScript(browser);
