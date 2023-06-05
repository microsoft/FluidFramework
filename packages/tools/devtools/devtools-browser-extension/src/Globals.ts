/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare const browser: typeof chrome;

// Normalize access to extension APIs across browsers.
const _browser: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

// Include references to web browser globals to facilitate mocks during testing.
const _window = window;

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
