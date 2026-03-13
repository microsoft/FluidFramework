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
	// Close the JSDOM window before removing globals. This clears all timers created during
	// JSDOM setup (e.g. requestAnimationFrame intervals) to allow mocha to exit cleanly.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const jsdom = (globalThis as any).$jsdom as { window: { close(): void } } | undefined;
	jsdom?.window.close();
	cleanup();
});
