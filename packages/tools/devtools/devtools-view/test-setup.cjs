/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha loads this module before it loads the tests. This module creates the jsdom environment,
 * supplies browser APIs that jsdom does not implement, and releases test resources.
 */

"use strict";

const globalJsdom = require("global-jsdom");

const NativeMessageChannel = globalThis.MessageChannel;
const cleanupJsdom = globalJsdom();
const jsdom = globalThis.$jsdom;

/**
 * Browsers do not use message ports to control process lifetime. Node.js does. Unreference ports
 * so browser-oriented schedulers do not keep Mocha active after the tests finish.
 */
globalThis.MessageChannel = class MessageChannel extends NativeMessageChannel {
	constructor() {
		super();
		queueMicrotask(() => {
			this.port1.unref();
			this.port2.unref();
		});
	}
};

const { cleanup } = require("@testing-library/react");

/**
 * jsdom does not implement canvas rendering. The tests do not inspect canvas output, so they
 * use a null rendering context.
 */
HTMLCanvasElement.prototype.getContext = () => null;

/**
 * Components use ResizeObserver to calculate their layout. This test implementation reports a
 * fixed size when observation starts. The synchronous callback makes each layout deterministic.
 */
class ResizeObserver {
	constructor(callback) {
		this.callback = callback;
	}

	observe(target) {
		this.callback(
			[
				{
					target,
					contentRect: {
						x: 0,
						y: 0,
						width: 800,
						height: 600,
						top: 0,
						right: 800,
						bottom: 600,
						left: 0,
						toJSON: () => ({}),
					},
				},
			],
			this,
		);
	}
	unobserve() {}
	disconnect() {}
}

// Application code can get ResizeObserver from either global object.
globalThis.ResizeObserver = ResizeObserver;
window.ResizeObserver = ResizeObserver;

exports.mochaHooks = {
	afterEach() {
		// Remove components and event handlers that the test rendered in the document.
		cleanup();
	},
	afterAll() {
		/** Close the window to stop its timers and event listeners. Then remove the jsdom globals. */
		jsdom.window.close();
		cleanupJsdom();
		globalThis.MessageChannel = NativeMessageChannel;
	},
};
