/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RunCounter } from "../runCounter.js";

describe("RunCounter", () => {
	it("should start with zero runs", () => {
		const runCounter = new RunCounter();
		assert.strictEqual(runCounter.runs, 0);
		assert.strictEqual(runCounter.running, false);
	});

	it("should increment runs when running", () => {
		const runCounter = new RunCounter();
		runCounter.run(() => {
			assert.strictEqual(runCounter.runs, 1);
			assert.strictEqual(runCounter.running, true);
		});
		assert.strictEqual(runCounter.runs, 0);
		assert.strictEqual(runCounter.running, false);
	});

	it("should handle nested runs correctly", () => {
		const runCounter = new RunCounter();
		runCounter.run(() => {
			assert.strictEqual(runCounter.runs, 1);
			runCounter.run(() => {
				assert.strictEqual(runCounter.runs, 2);
			});
			assert.strictEqual(runCounter.runs, 1);
		});
		assert.strictEqual(runCounter.runs, 0);
	});

	it("should return the result of the action", () => {
		const runCounter = new RunCounter();
		const result = runCounter.run(() => 42);
		assert.strictEqual(result, 42);
	});

	it("should decrement runs even if the action throws", () => {
		const runCounter = new RunCounter();
		assert.throws(() => {
			runCounter.run(() => {
				throw new Error("test error");
			});
		}, /test error/);
		assert.strictEqual(runCounter.runs, 0);
		assert.strictEqual(runCounter.running, false);
	});
});
