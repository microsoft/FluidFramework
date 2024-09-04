/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

/**
 * TODO: This test attempts to verify that the `benchmarkCustom()` is able to throw an error payload as expected.
 * However, this test is not working as expected due to complication around mocha runtime. The test is skipped for now.
 */
describe.skip("BenchmarkCustom error handling", () => {
	const expectedErrorMessage = "INTENTIONAL error to test error handling";
	let benchmarkEndPayloadIsCorrect: boolean = false;

	const testObject = benchmarkCustom({
		title: `test`,
		type: BenchmarkType.Measurement,
		run: async () => {
			throw new Error(expectedErrorMessage);
		},
	});

	testObject.on("benchmark end", (benchmarkError: BenchmarkError) => {
		console.log(benchmarkError.error); // Check what is actually being passed here
		if (benchmarkError.error === expectedErrorMessage) {
			benchmarkEndPayloadIsCorrect = true;
		}
	});

	// For the purpose of this test, we want to:
	// 1) Report an event (i.e, `benchmark end`) to the reporter
	// 2) Skip the test if the `bechmarkCustom()` throws an error payload as expected.
	afterEach(async function () {
		if (benchmarkEndPayloadIsCorrect) {
			this.skip();
		} else {
			throw new Error("The benchmark end payload was not correct.");
		}
	});
});
