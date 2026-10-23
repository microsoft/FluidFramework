/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	devtoolsMessageSource,
	handleIncomingWindowMessage,
} from "@fluidframework/devtools-core/internal";
import { createSandbox } from "sinon";

import { WindowMessageRelay } from "../WindowMessageRelay.js";

describe("Window message sender validation", () => {
	const sandbox = createSandbox();
	const message = { source: devtoolsMessageSource, type: "TEST", data: undefined };
	let iframe: HTMLIFrameElement;

	beforeEach(() => {
		iframe = document.createElement("iframe");
		document.body.append(iframe);
	});

	afterEach(() => {
		iframe.remove();
		sandbox.restore();
	});

	for (const origin of ["http://localhost", "https://example.com", "null"]) {
		it(`Rejects another window and missing senders regardless of origin (${origin})`, () => {
			const handler = sandbox.stub().resolves(true);
			assert.notEqual(iframe.contentWindow, null);
			for (const source of [iframe.contentWindow, null]) {
				handleIncomingWindowMessage(
					new window.MessageEvent("message", { data: message, source, origin }),
					{ TEST: handler },
				);
			}
			assert.equal(handler.callCount, 0);
		});

		it(`Accepts the application's own window (${origin})`, () => {
			const handler = sandbox.stub().resolves(true);
			handleIncomingWindowMessage(
				new window.MessageEvent("message", { data: message, source: window, origin }),
				{ TEST: handler },
			);
			assert.equal(handler.callCount, 1);
			assert.deepEqual(handler.firstCall.args, [message]);
		});
	}

	it("Only forwards messages from the application's own window to view subscribers", () => {
		sandbox.define(globalThis, "addEventListener", window.addEventListener.bind(window));
		const addListener = sandbox.spy(globalThis, "addEventListener");
		const relay = new WindowMessageRelay("test-view");
		const subscriber = sandbox.spy();
		relay.on("message", subscriber);
		const listener = addListener.firstCall.args[1];
		try {
			assert.notEqual(iframe.contentWindow, null);
			for (const source of [iframe.contentWindow, null]) {
				window.dispatchEvent(new window.MessageEvent("message", { data: message, source }));
			}
			assert.equal(subscriber.callCount, 0);

			window.dispatchEvent(
				new window.MessageEvent("message", { data: message, source: window }),
			);
			assert.equal(subscriber.callCount, 1);
			assert.deepEqual(subscriber.firstCall.args, [message]);
		} finally {
			window.removeEventListener("message", listener);
		}
	});
});
