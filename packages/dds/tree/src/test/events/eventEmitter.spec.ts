/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { EventEmitter, ISubscribable, createEmitter } from "../../events/index.js";

interface TestEvents {
	open: () => void;
	close: (error: boolean) => void;
	compute: (input: string) => string;
}

describe("EventEmitter", () => {
	it("emits events", () => {
		const emitter = createEmitter<TestEvents>();
		const log: string[] = [];
		emitter.on("open", () => log.push("opened"));
		emitter.emit("open");
		assert.deepEqual(log, ["opened"]);
	});

	it("emits events and collects their results", () => {
		const emitter = createEmitter<TestEvents>();
		const listener1 = (arg: string) => arg.toUpperCase();
		const listener2 = (arg: string) => arg.toLowerCase();
		emitter.on("compute", listener1);
		emitter.on("compute", listener2);
		const results = emitter.emitAndCollect("compute", "hello");
		assert.deepEqual(results, ["HELLO", "hello"]);
	});

	it("emits events and collects an empty result array when no listeners registered", () => {
		const emitter = createEmitter<TestEvents>();
		const results = emitter.emitAndCollect("compute", "hello");
		assert.deepEqual(results, []);
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

	it("allows duplicate event listeners", () => {
		const emitter = createEmitter<TestEvents>();
		let count: number;
		const listener = () => (count += 1);
		const off1 = emitter.on("open", listener);
		const off2 = emitter.on("open", listener);

		count = 0;
		emitter.emit("open");
		assert.strictEqual(count, 2); // Listener should be fired twice

		count = 0;
		off1();
		emitter.emit("open");
		assert.strictEqual(count, 1);

		count = 0;
		off2();
		emitter.emit("open");
		assert.strictEqual(count, 0);
	});

	it("fails on duplicate deregistrations", () => {
		const emitter = createEmitter<TestEvents>();
		const deregister = emitter.on("open", () => {});
		const deregisterB = emitter.on("open", () => {});
		deregister();
		assert.throws(
			() => deregister(),
			(e: Error) =>
				validateAssertionError(
					e,
					"Listener does not exist. Event deregistration functions may only be invoked once.",
				),
		);
		deregisterB();
		assert.throws(
			() => deregister(),
			(e: Error) =>
				validateAssertionError(
					e,
					"Event has no listeners. Event deregistration functions may only be invoked once.",
				),
		);
	});

	it("skips events adding during event", () => {
		const emitter = createEmitter<TestEvents>();
		const log: string[] = [];
		const unsubscribe = emitter.on("open", () => {
			log.push("A");
			emitter.on("open", () => {
				log.push("B");
			});
		});
		emitter.emit("open");
		unsubscribe();
		assert.deepEqual(log, ["A"]);
		emitter.emit("open");
		assert.deepEqual(log, ["A", "B"]);
	});

	it("reentrant events", () => {
		const emitter = createEmitter<TestEvents>();
		const log: string[] = [];
		const unsubscribe = emitter.on("open", () => {
			log.push("A1");
			emitter.on("open", () => {
				log.push("B");
			});
			unsubscribe();
			emitter.emit("open");
			log.push("A2");
		});
		emitter.emit("open");
		assert.deepEqual(log, ["A1", "B", "A2"]);
	});
});

interface MyEvents {
	loaded: () => void;
	computed: () => number;
}

// The below classes correspond to the examples given in the doc comment of `EventEmitter` to ensure that they compile

class MyInheritanceClass extends EventEmitter<MyEvents> {
	private load() {
		this.emit("loaded");
		const results: number[] = this.emitAndCollect("computed");
	}
}

class MyCompositionClass implements ISubscribable<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load() {
		this.events.emit("loaded");
		const results: number[] = this.events.emitAndCollect("computed");
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}
}
