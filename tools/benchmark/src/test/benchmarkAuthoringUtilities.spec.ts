/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { captureResults, stripUndefined } from "../benchmarkAuthoringUtilities.js";
import { isResultError } from "../reportTypes.js";
import { ValueType, type CollectedData } from "../reportTypes.js";

const primaryMeasurement: CollectedData[0] = {
	name: "test",
	value: 42,
	units: "ns/op",
	type: ValueType.SmallerIsBetter,
	significance: "Primary",
};

describe("benchmarkAuthoringUtilities", () => {
	it("stripUndefined", () => {
		assert.deepEqual(stripUndefined({ a: 1, b: undefined }), { a: 1 });
	});

	describe("captureResults", () => {
		it("returns CollectedData with an appended duration measurement on success", async () => {
			const data: CollectedData = [primaryMeasurement];
			const { result, exception } = await captureResults(async () => data);
			assert.equal(exception, undefined);
			assert.equal(isResultError(result), false);
			if (!isResultError(result)) {
				// First measurement is the original primary measurement
				assert.equal(result[0].name, "test");
				// Last measurement is the appended "Test Duration"
				const last = result[result.length - 1];
				assert.equal(last.name, "Test Duration");
				assert.equal(last.units, "seconds");
			}
		});

		it("returns BenchmarkError when function throws an Error", async () => {
			const error = new Error("boom");
			const result = await captureResults(async () => {
				throw error;
			});
			assert.deepEqual(result, { result: { error: "boom" }, exception: error });
		});

		it("returns BenchmarkError when function throws a non-Error value", async () => {
			const result = await captureResults(async () => {
				// eslint-disable-next-line @typescript-eslint/only-throw-error
				throw "a plain string error";
			});
			assert.deepEqual(result, {
				result: { error: "a plain string error" },
				exception: undefined,
			});
		});

		it("uses the provided durationMeasurementName", async () => {
			const data: CollectedData = [primaryMeasurement];
			const { result } = await captureResults(async () => data, "Custom Duration");
			assert.equal(isResultError(result), false);
			if (!isResultError(result)) {
				const last = result[result.length - 1];
				assert.equal(last.name, "Custom Duration");
			}
		});
	});
});
