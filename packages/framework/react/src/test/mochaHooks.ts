/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globalJsdom from "global-jsdom";

// Set up JSDOM before any modules are loaded (Quill needs document at import time)
const cleanup = globalJsdom();

// Remove JSDOM after imports are done, but before we run any tests.
// Tests which require JSDOM can call globalJsdom() to setup their own clean dom.
before(() => {
	cleanup();
});
