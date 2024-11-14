/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { createEmitter } from "@fluidframework/core-utils/internal";

interface TestEvents {
	open: () => void;
	close: (error: boolean) => void;
	compute: (input: string) => string;
}

describe("EventEmitter", () => {
	it("errors on multiple registrations of the same listener", () => {
		const emitter = createEmitter<TestEvents>();
		let count = 0;
		const listener = () => (count += 1);
		emitter.on("open", listener);
		assert.throws(
			() => emitter.on("open", listener),
			(e: Error) => validateAssertionError(e, /register.*twice.*open/),
		);
		// If error is caught, the listener should still fire once for the first registration
		emitter.emit("open");
		assert.strictEqual(count, 1);
	});

	it("includes symbol description in the error message on multiple registrations of the same listener", () => {
		// This test ensures that symbol types are registered, error on double registration, and include the description of the symbol in the error message.
		const eventSymbol = Symbol("TestEvent");
		const emitter = createEmitter<{ [eventSymbol]: () => void }>();
		const listener = () => {};
		emitter.on(eventSymbol, listener);
		emitter.emit(eventSymbol);
		assert.throws(
			() => emitter.on(eventSymbol, listener),
			(e: Error) => validateAssertionError(e, /register.*twice.*TestEvent/),
		);
	});
});
