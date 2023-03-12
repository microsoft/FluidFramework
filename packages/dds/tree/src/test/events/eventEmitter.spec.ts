/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { createEmitter, EventEmitter, ISubscribable } from "../../events";

interface TestEvents {
	open: () => void;
	close: (error: boolean) => void;
}

describe("EventEmitter", () => {
	it("emits events", () => {
		const emitter = createEmitter<TestEvents>();
		let opened = false;
		emitter.on("open", () => {
			assert(!opened, "Event should only be fired once");
			opened = true;
		});
		emitter.emit("open");
		assert(opened);
	});

	it("passes arguments to events", () => {
		const emitter = createEmitter<TestEvents>();
		let error = false;
		emitter.on("close", (e: boolean) => {
			error = e;
		});
		emitter.emit("close", true);
		assert.strictEqual(error, true);
	});

	it("emits multiple events", () => {
		const emitter = createEmitter<TestEvents>();
		let opened = false;
		let closed = false;
		emitter.on("open", () => {
			opened = true;
		});
		emitter.on("close", () => {
			closed = true;
		});
		emitter.emit("open");
		assert(opened);
		assert(!closed);
		emitter.emit("close", false);
		assert(opened);
		assert(closed);
	});

	it("deregisters events", () => {
		const emitter = createEmitter<TestEvents>();
		let error = false;
		const deregister = emitter.on("close", (e: boolean) => {
			error = e;
		});
		deregister();
		emitter.emit("close", true);
		assert.strictEqual(error, false);
	});

	it("deregisters multiple events", () => {
		const emitter = createEmitter<TestEvents>();
		let opened = false;
		let closed = false;
		const deregisterOpen = emitter.on("open", () => {
			opened = true;
		});
		const deregisterClosed = emitter.on("close", () => {
			closed = true;
		});
		deregisterOpen();
		deregisterClosed();
		emitter.emit("open");
		assert(!opened);
		assert(!closed);
		emitter.emit("close", false);
		assert(!opened);
		assert(!closed);
	});

	it("ignores duplicate events", () => {
		const emitter = createEmitter<TestEvents>();
		let count = 0;
		const listener = () => (count += 1);
		emitter.on("open", listener);
		emitter.on("open", listener);
		emitter.emit("open");
		// Count should be 1, not 2, even though `listener` was registered twice
		assert.strictEqual(count, 1);
	});

	it("fails on duplicate deregistrations", () => {
		const emitter = createEmitter<TestEvents>();
		const deregister = emitter.on("open", () => {});
		const deregisterB = emitter.on("open", () => {});
		deregister();
		assert.throws(
			() => deregister(),
			(e) =>
				validateAssertionError(
					e,
					"Listener does not exist. Event deregistration functions may only be invoked once.",
				),
		);
		deregisterB();
		assert.throws(
			() => deregister(),
			(e) =>
				validateAssertionError(
					e,
					"Event has no listeners. Event deregistration functions may only be invoked once.",
				),
		);
	});
});

interface MyEvents {
	loaded: () => void;
}

// The below classes correspond to the examples given in the doc comment of `EventEmitter` to ensure that they compile

class MyInheritanceClass extends EventEmitter<MyEvents> {
	private load() {
		this.emit("loaded");
	}
}

class MyCompositionClass implements ISubscribable<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load() {
		this.events.emit("loaded");
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}
}
