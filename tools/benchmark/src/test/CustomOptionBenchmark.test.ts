/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { benchmarkCustom } from "..";
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

	it.only("check BenchmarkCustom can handle an error", async () => {
		const errorMessage = "INTENTIONAL error to test error handling";

		const error = benchmarkCustom({
			title: `test`,
			type: BenchmarkType.Measurement,
			run: async () => {
				throw new Error(errorMessage);
			},
		});

		expect(error.err?.message).to.equal(errorMessage);
	});
});
