/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { wrapObjectAndOverride } from "../mocking.js";

// Keep existing deep fault-injection semantics when storage observers reuse the shared helper.
describe("Seed projection reference: shared deep mocking", () => {
	// Existing fault-injection users rely on an unoverridden method or getter seeing overridden siblings.
	it("preserves proxy-receiver sibling dispatch and method identity by default", () => {
		const original = {
			read() {
				return "original";
			},
			readThroughSibling() {
				return this.read();
			},
			get value() {
				return this.read();
			},
		};
		const wrapped = wrapObjectAndOverride(original, {
			read: (owner) => () => {
				assert.equal(owner, original);
				return "overridden";
			},
		});
		assert.equal(wrapped.readThroughSibling, original.readThroughSibling);
		assert.equal(wrapped.readThroughSibling(), "overridden");
		assert.equal(wrapped.value, "overridden");
		assert.equal(original.readThroughSibling(), "original");
		assert.equal(original.value, "original");
	});

	// Nested synchronous results must retain their real receivers and leave the original objects unchanged.
	it("wraps synchronous return values and evaluates replacement factories against the original", () => {
		const child = { value: 3 };
		const original = {
			child() {
				assert.equal(this, original);
				return child;
			},
		};
		const wrapped = wrapObjectAndOverride(original, {
			child: {
				value: (owner) => {
					assert.equal(owner, child);
					return owner.value + 1;
				},
			},
		});
		assert.equal(wrapped.child().value, 4);
		child.value = 5;
		assert.equal(wrapped.child().value, 6);
		assert.equal(original.child().value, 5);
	});

	// Storage calls are reached through promises; both arguments and nested failure identity must survive.
	it("wraps asynchronous results without swallowing overridden rejections", async () => {
		const originalFailure = new Error("storage unavailable");
		const injectedFailure = new Error("injected storage failure");
		const child = {
			async read(id: string) {
				assert.equal(this, child);
				assert.equal(id, "blob");
				throw originalFailure;
			},
		};
		const original = {
			async connect(id: string) {
				assert.equal(this, original);
				assert.equal(id, "document");
				return child;
			},
		};
		const wrapped = wrapObjectAndOverride(original, {
			connect: {
				read: (owner) => async (id) => {
					assert.equal(owner, child);
					assert.equal(id, "blob");
					throw injectedFailure;
				},
			},
		});
		const storage = await wrapped.connect("document");
		await assert.rejects(storage.read("blob"), (error) => error === injectedFailure);
		await assert.rejects(child.read("blob"), (error) => error === originalFailure);
	});

	it("propagates synchronous throws from nested method calls", () => {
		const failure = new Error("storage unavailable");
		const original = {
			connect(): { connectionId: string } {
				throw failure;
			},
		};
		const wrapped = wrapObjectAndOverride(original, {
			connect: { connectionId: () => "overridden" },
		});
		assert.throws(
			() => wrapped.connect(),
			(error) => error === failure,
		);
	});

	// Arbitrary driver extensions can use symbol methods or private fields in live prototype getters.
	it("opts into original receivers for unoverridden getters and extracted methods", () => {
		const capability = Symbol("future driver capability");
		/** Private state makes an incorrect proxy receiver fail instead of merely returning stale data. */
		class Original {
			/** Driver-owned state is never copied into the wrapper. */
			#value = 1;
			/** Live getter that must execute on the actual instance. */
			public get value(): number {
				return this.#value;
			}
			/** Symbol-keyed method exercises unknown capabilities as well as extracted method binding. */
			public [capability](): number {
				return ++this.#value;
			}
		}
		const original = new Original();
		const wrapped = wrapObjectAndOverride(original, {}, { receiver: "target" });
		assert.equal(wrapped.value, 1);
		const advance = wrapped[capability];
		assert.equal(advance(), 2);
		assert.equal(wrapped.value, 2);
		assert(capability in wrapped);
	});

	// Nested storage wrappers must inherit target mode and release the original private-state owner.
	it("propagates target mode through synchronous and asynchronous results including cleanup", async () => {
		/** A returned service with private lifetime state detects accidental proxy receivers. */
		class Service {
			/** Per-service disposal state, not wrapper-owned state. */
			#disposed = false;
			/** Private state must be readable through a nested observational wrapper. */
			public get disposed(): boolean {
				return this.#disposed;
			}
			/** Normal sibling calls in target mode must remain original calls, not injected overrides. */
			public status(): boolean {
				return this.disposed;
			}
			/** An extracted cleanup method must dispose exactly the original service. */
			public dispose(): void {
				assert.equal(this.#disposed, false);
				this.#disposed = true;
			}
		}
		const syncService = new Service();
		const asyncService = new Service();
		const factory = {
			sync: () => syncService,
			async: async () => asyncService,
		};
		const wrapped = wrapObjectAndOverride(
			factory,
			{
				sync: { disposed: () => true },
				async: { disposed: () => true },
			},
			{ receiver: "target" },
		);
		const syncResult = wrapped.sync();
		const asyncResult = await wrapped.async();
		for (const result of [syncResult, asyncResult]) {
			assert.equal(result.disposed, true, "The explicit override remains observable");
			assert.equal(result.status(), false, "Original methods retain the original receiver");
			const dispose = result.dispose;
			dispose();
			assert.equal(result.status(), true);
		}
		assert.equal(syncService.disposed, true);
		assert.equal(asyncService.disposed, true);
	});

	// Observation must not advertise optional driver features which the underlying implementation lacks.
	it("does not invent absent capabilities or change unoverridden property values", () => {
		const policies = { supportGetSnapshotApi: false };
		const original = { policies };
		const wrapped = wrapObjectAndOverride(original, {});
		assert.equal(wrapped.policies, policies);
		assert.equal(Reflect.has(wrapped, "getSnapshot"), false);
	});
});
