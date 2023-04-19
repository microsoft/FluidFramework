/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: audit what is actually needed here

declare const browser: typeof chrome;

// Normalize access to extension APIs across browsers.
const _browser: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

// Include references to web browser globals to facilitate mocks during testing.
const _document = document;
const _eval = eval; // eslint-disable-line no-eval
// const _fetch = fetch.bind(window);
const _location = location;
const _MutationObserver = MutationObserver;
const _window = window;

export {
	_browser as browser,
	_document as document,
	_eval as eval,
	// _fetch as fetch,
	_location as location,
	_MutationObserver as MutationObserver,
	_window as window,
};

/**
 * Stubbed browser globals
 */
export interface Globals {
	browser: typeof chrome;
	document?: Document;
	eval?: (script: string) => unknown;
	fetch?: () => void;
	location?: Location;
	window?: Window & typeof globalThis;
}
