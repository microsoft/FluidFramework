/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { mergeAPIs } from "../sharedObjectKernel.js";

describe("sharedObjectKernel", () => {
	describe("mergeAPIs", () => {
		it("basic", () => {
			const base = { a: "A" };
			const extra = { b: "B" };
			mergeAPIs(base, extra);
			assert.deepEqual(base, { a: "A", b: "B" });
		});

		it("collision", () => {
			const base = { a: "A" };
			const extra = { a: "B" };
			assert.throws(() => mergeAPIs(base, extra));
		});

		it("symbol", () => {
			const base = { a: "A" };
			const extra = { [Symbol.iterator]: "B" };
			mergeAPIs(base, extra);
			assert.deepEqual(base, { a: "A", [Symbol.iterator]: "B" });
		});

		it("getter", () => {
			const log: unknown[] = [];
			const base = { a: "A" };
			const extra = {
				get b() {
					log.push(this);
					return "B";
				},
			};
			mergeAPIs(base, extra);
			const b = base.b; // Access the getter to trigger it
			assert.equal(b, "B");
			assert.deepEqual(log, [extra]);
		});

		it("method binding", () => {
			const log: unknown[] = [];
			const base = { a: "A" };
			const extra = {
				b() {
					log.push(this);
					return "B";
				},
			};
			mergeAPIs(base, extra);
			const b = base.b();
			assert.equal(b, "B");
			assert.deepEqual(log, [extra]);
		});
	});
});
