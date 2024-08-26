/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { benchmarkCustom, type BenchmarkError } from "..";
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

describe("BenchmarkCustom error handling", () => {
	const expectedErrorMessage = "INTENTIONAL error to test error handling";

	const testObject = benchmarkCustom({
		title: `test`,
		type: BenchmarkType.Measurement,
		run: async () => {
			throw new Error(expectedErrorMessage);
		},
	});

	testObject.on("benchmark end", (benchmarkError: BenchmarkError) => {
		expect(benchmarkError.error).to.equal(expectedErrorMessage);
	});
});
