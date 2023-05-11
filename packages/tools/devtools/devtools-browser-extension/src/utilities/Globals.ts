/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare const browser: typeof chrome;

// Normalize access to extension APIs across browsers.
const _browser: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

export {
	_browser as browser,
	// TODO: other globals as necessary
};

/**
 * Stubbed browser globals
 */
export interface Globals {
	browser: typeof chrome;
	// TODO: other globals as necessary
}
