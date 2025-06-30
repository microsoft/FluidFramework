/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type { BatchResubmitInfo } from "../opLifecycle/index.js";
import { BatchRunCounter, RunCounter } from "../runCounter.js";

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

describe("BatchRunCounter", () => {
	describe("BatchRunCounter", () => {
		it("should start with zero runs and undefined resubmitInfo", () => {
			const batchRunCounter = new BatchRunCounter();
			assert.strictEqual(batchRunCounter.runs, 0);
			assert.strictEqual(batchRunCounter.running, false);
			assert.strictEqual(batchRunCounter.resubmitInfo, undefined);
		});

		it("should set and clear resubmitInfo during run", () => {
			const batchRunCounter = new BatchRunCounter();
			const info: BatchResubmitInfo = { batchId: "foo", staged: true };
			batchRunCounter.run(() => {
				assert.strictEqual(batchRunCounter.resubmitInfo, info);
			}, info);
			assert.strictEqual(batchRunCounter.resubmitInfo, undefined);
		});

		it("should pass through return value from run", () => {
			const batchRunCounter = new BatchRunCounter();
			const result = batchRunCounter.run(() => 123, undefined);
			assert.strictEqual(result, 123);
		});

		it("should decrement runs and clear resubmitInfo even if action throws", () => {
			const batchRunCounter = new BatchRunCounter();
			const info: BatchResubmitInfo = { batchId: "foo", staged: true };
			assert.throws(() => {
				batchRunCounter.run(() => {
					throw new Error("fail");
				}, info);
			}, /fail/);
			assert.strictEqual(batchRunCounter.runs, 0);
			assert.strictEqual(batchRunCounter.resubmitInfo, undefined);
		});

		it("should not allow reentrancy if outer call sets resubmitInfo", () => {
			const batchRunCounter = new BatchRunCounter();
			assert.throws(
				() => {
					batchRunCounter.run(
						() => {
							batchRunCounter.run(() => {});
						},
						{ batchId: "foo", staged: true },
					);
				},
				(e) => validateAssertionError(e as Error, "Reentrancy not allowed in BatchRunCounter"),
			);
		});
	});
});
