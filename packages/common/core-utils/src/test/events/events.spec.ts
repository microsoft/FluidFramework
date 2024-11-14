/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Listenable } from "@fluidframework/core-interfaces/internal";

import { EventEmitter, createEmitter } from "@fluidframework/core-utils/internal";

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
		const listener1 = (arg: string): string => arg.toUpperCase();
		const listener2 = (arg: string): string => arg.toLowerCase();
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

	it("deregisters events via callback", () => {
		const emitter = createEmitter<TestEvents>();
		let error = false;
		const deregister = emitter.on("close", (e: boolean) => (error = e));
		deregister();
		emitter.emit("close", true);
		assert.strictEqual(error, false);
	});

	it("deregisters events via off", () => {
		const emitter = createEmitter<TestEvents>();
		let error = false;
		const listener = (e: boolean): boolean => (error = e);
		emitter.on("close", listener);
		emitter.off("close", listener);
		emitter.emit("close", true);
		assert.strictEqual(error, false);
	});

	it("deregisters multiple events via callback", () => {
		const emitter = createEmitter<TestEvents>();
		let opened = false;
		let closed = false;
		const deregisterOpen = emitter.on("open", () => (opened = true));
		const deregisterClosed = emitter.on("close", () => (closed = true));
		deregisterOpen();
		deregisterClosed();
		emitter.emit("open");
		assert(!opened);
		assert(!closed);
		emitter.emit("close", false);
		assert(!opened);
		assert(!closed);
	});

	it("deregisters multiple events via off", () => {
		const emitter = createEmitter<TestEvents>();
		let opened = false;
		let closed = false;
		const listenerOpen = (): boolean => (opened = true);
		const listenerClosed = (): boolean => (closed = true);
		emitter.on("open", listenerOpen);
		emitter.on("close", listenerClosed);
		emitter.off("open", listenerOpen);
		emitter.off("close", listenerClosed);
		emitter.emit("open");
		assert(!opened);
		assert(!closed);
		emitter.emit("close", false);
		assert(!opened);
		assert(!closed);
	});

	it("correctly handles multiple registrations for the same event", () => {
		const emitter = createEmitter<TestEvents>();
		let count: number;
		const listener = (): number => (count += 1);
		const off1 = emitter.on("open", listener);
		const off2 = emitter.on("open", () => listener());

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

	it("allows repeat deregistrations", () => {
		const emitter = createEmitter<TestEvents>();
		const deregister = emitter.on("open", () => {});
		const listenerB = (): void => {};
		emitter.on("open", listenerB);
		deregister();
		deregister();
		emitter.off("open", listenerB);
		emitter.off("open", listenerB);
	});

	it("skips events added during event", () => {
		const emitter = createEmitter<TestEvents>();
		const log: string[] = [];
		const off = emitter.on("open", () => {
			log.push("A");
			emitter.on("open", () => {
				log.push("B");
			});
		});
		emitter.emit("open");
		off();
		assert.deepEqual(log, ["A"]);
		emitter.emit("open");
		assert.deepEqual(log, ["A", "B"]);
	});

	it("skips events removed during event", () => {
		function test(remove: boolean, expected: string[]): void {
			const log: string[] = [];
			const emitter = createEmitter<TestEvents>();
			emitter.on("open", () => {
				log.push("A");
				if (remove) {
					offB();
				}
			});
			const offB = emitter.on("open", () => {
				log.push("B");
			});
			emitter.emit("open");
			assert.deepEqual(log, expected);
		}

		// Because event ordering is not guaranteed, we first test the control case to ensure that the second event fires after the first...
		test(false, ["A", "B"]);
		// ... and then test the same scenario but with the second event removed before it can fire.
		test(true, ["A"]);
		// If event ordering ever changes, this test will need to be updated to account for that.
	});

	it("fires the noListeners callback when the last listener is removed", () => {
		let noListenersFired = false;
		const emitter = createEmitter<TestEvents>(() => (noListenersFired = true));
		const offA = emitter.on("open", () => {});
		const offB = emitter.on("open", () => {});
		assert.equal(noListenersFired, false);
		offA();
		assert.equal(noListenersFired, false);
		offB();
		assert.equal(noListenersFired, true);
	});

	it("reports whether or not it has listeners", () => {
		const emitter = createEmitter<TestEvents>();
		assert.equal(emitter.hasListeners(), false);
		const offA = emitter.on("open", () => {});
		assert.equal(emitter.hasListeners(), true);
		const offB = emitter.on("open", () => {});
		assert.equal(emitter.hasListeners(), true);
		offB();
		assert.equal(emitter.hasListeners(), true);
		offA();
		assert.equal(emitter.hasListeners(), false);
	});

	it("reports whether or not it has listeners for a given event", () => {
		const emitter = createEmitter<TestEvents>();
		assert.equal(emitter.hasListeners("open"), false);
		assert.equal(emitter.hasListeners("close"), false);
		const offA = emitter.on("open", () => {});
		assert.equal(emitter.hasListeners("open"), true);
		assert.equal(emitter.hasListeners("close"), false);
		const offB = emitter.on("close", () => {});
		assert.equal(emitter.hasListeners("open"), true);
		assert.equal(emitter.hasListeners("close"), true);
		offA();
		assert.equal(emitter.hasListeners("open"), false);
		assert.equal(emitter.hasListeners("close"), true);
		offB();
		assert.equal(emitter.hasListeners("open"), false);
		assert.equal(emitter.hasListeners("close"), false);
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

/**
 *
 * The below classes correspond to the examples given in {@link EventEmitter} to ensure that they compile.
 *
 * Provides an API for subscribing to and listening to events.
 *
 * @remarks Classes wishing to emit events may either extend this class, compose over it, or expose it as a property of type {@link @fluidframework/core-interfaces#Listenable}.
 *
 * Note: These are for testing only and should not be re-exported.
 */

interface MyEvents {
	loaded: () => void;
	computed: () => number;
}

/**
 * @example Extending this class
 */
export class MyInheritanceClass extends EventEmitter<MyEvents> {
	private load(): number[] {
		this.emit("loaded");
		const results: number[] = this.emitAndCollect("computed");
		return results;
	}

	public triggerLoad(): void {
		this.load();
	}
}

/**
 * @example Composing over this class
 */
export class MyCompositionClass implements Listenable<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load(): number[] {
		this.events.emit("loaded");
		const results: number[] = this.events.emitAndCollect("computed");
		return results;
	}

	public triggerLoad(): void {
		this.load();
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public off<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): void {
		return this.events.off(eventName, listener);
	}
}

/**
 * @example Exposing this class as a property
 */
export class MyExposingClass {
	private readonly _events = createEmitter<MyEvents>();

	public readonly events: Listenable<MyEvents> = this._events;

	private load(): number[] {
		this._events.emit("loaded");
		const results: number[] = this._events.emitAndCollect("computed");
		return results;
	}
	public triggerLoad(): void {
		this.load();
	}
}
