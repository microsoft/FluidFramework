/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IErrorEvent, TypedEventEmitter } from "../typedEventEmitter";

describe("TypedEventEmitter", () => {
	it("Validate Function proxies", () => {
		const tee = new TypedEventEmitter<IErrorEvent>();
		let once = 0;

		tee.once("error", () => once++);
		assert.equal(tee.listenerCount("error"), 1);

		let on = 0;
		tee.on("error", () => on++);
		assert.equal(tee.listenerCount("error"), 2);

		for (let i = 0; i < 5; i++) {
			tee.emit("error", "message");
		}

		assert.equal(once, 1);
		assert.equal(on, 5);
	});

	it("Validate new and remove Listener", () => {
		const tee = new TypedEventEmitter<IErrorEvent>();
		let newListenerCalls = 0;
		let removeListenerCalls = 0;
		const errListener = (): void => {};
		tee.on("removeListener", (event, listener) => {
			assert.equal(event, "error");
			assert.equal(listener, errListener);
			removeListenerCalls++;
		});
		tee.on("newListener", (event, listener) => {
			assert.equal(event, "error");
			assert.equal(listener, errListener);
			newListenerCalls++;
		});

		tee.on("error", errListener);
		tee.removeListener("error", errListener);

		assert.equal(newListenerCalls, 1);
		assert.equal(removeListenerCalls, 1);
	});
});
