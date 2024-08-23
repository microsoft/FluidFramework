/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";

import { benchmarkCustom, type BenchmarkError, type BenchmarkResult } from "..";
import { BenchmarkType } from "../Configuration";

describe("`benchmarkCustom` function", () => {
	it("run BenchmarkCustom", async () => {
		benchmarkCustom({
			title: `test`,
			run: async (reporter) => {
				reporter.addMeasurement("test", 0);
			},
			type: BenchmarkType.OwnCorrectness,
		});
	});
});

describe.only("BenchmarkCustom error handling", () => {
	const expectedErrorMessage = "INTENTIONAL error to test error handling";
	let benchmarkEndPayloadIsCorrect: boolean = false;

	const testObject = benchmarkCustom({
		title: `test`,
		type: BenchmarkType.Measurement,
		run: async () => {
			throw new Error(expectedErrorMessage);
		},
	});

	testObject.on("benchmark end", (error: BenchmarkResult) => {
		const maybeError = error as BenchmarkError;
		if (maybeError.error === expectedErrorMessage) {
			benchmarkEndPayloadIsCorrect = true;
		}
	});

	afterEach(() => {
		assert.equal(benchmarkEndPayloadIsCorrect, true);
		benchmarkEndPayloadIsCorrect = false;
	});
});
