/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globalJsdom from "global-jsdom";

// Set up JSDOM before any modules are loaded (Quill needs document at import time).
// @fluidframework/react imports Quill at ESM module-load time, so document must exist
// before the test file's static imports are resolved.
const cleanup = globalJsdom();

// Remove JSDOM after imports are done, but before we run any tests.
// Tests which require JSDOM (e.g. the "dom tests" describe block) call globalJsdom()
// themselves to set up their own clean DOM.
before(() => {
	cleanup();
});
