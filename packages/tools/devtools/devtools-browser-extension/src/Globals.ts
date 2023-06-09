/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare const browser: typeof chrome;

// Normalize access to extension APIs across browsers.
const _browser: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

// Include references to web browser globals to facilitate mocks during testing.
// Note: this will always be `undefined` in the BackgroundScript, but we expect it to be defined elsewhere.
const _window = typeof window === "undefined" ? undefined : window;

export {
	_browser as browser,
	_window as window,
	// TODO: other globals as necessary
};

/**
 * Stubbed browser globals
 */
export interface Globals {
	browser: typeof chrome;
	window: Window & typeof globalThis;
	// TODO: other globals as necessary
}
