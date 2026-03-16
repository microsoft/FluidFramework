/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getArrayStatistics } from "../sampling.js";

describe("getArrayStatistics() function", () => {
	it("Throws if fractionOfSamplesToUse is out of range", () => {
		const array = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		assert.throws(
			() => getArrayStatistics(array, 0.05),
			{ message: "fractionOfSamplesToUse must be between 0.1 and 1 (inclusive)" },
			"Did not reject fractionOfSamplesToUse < 0.1",
		);
		assert.throws(
			() => getArrayStatistics(array, 1.01),
			{ message: "fractionOfSamplesToUse must be between 0.1 and 1 (inclusive)" },
			"Did not reject fractionOfSamplesToUse > 1.0",
		);
	});

	it("Handles a single sample", () => {
		const array = [5];
		const results = getArrayStatistics(array);
		assert.equal(results.arithmeticMean, 5);
		assert(Number.isNaN(results.variance));
		assert(Number.isNaN(results.standardDeviation));
		assert(Number.isNaN(results.standardErrorOfMean));
		assert(Number.isNaN(results.marginOfError));
		assert(Number.isNaN(results.marginOfErrorPercent));
	});

	it("Computes correct values when not dropping samples", () => {
		const array = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		const results = getArrayStatistics(array);

		// All these hardcoded values correspond to the statistics of an array with integer samples 1 through 10
		assert.equal(results.arithmeticMean, 5.5, "Computed incorrect mean");
		assert.equal(results.variance, 9.166_666_666_666_666, "Computed incorrect variance");
		assert.equal(
			results.standardDeviation,
			3.027_650_354_097_491_7,
			"Computed incorrect standard deviation",
		);
		assert.equal(
			results.standardErrorOfMean,
			0.957_427_107_756_338_1,
			"Computed incorrect sample error of the mean",
		);
		assert.equal(
			results.marginOfError,
			2.165_700_117_744_836_7,
			"Computed incorrect margin of error",
		);
		assert.equal(
			results.marginOfErrorPercent,
			39.376_365_777_178_854,
			"Computed incorrect relative margin of error",
		);

		// Output array of samples doesn't need to be sorted if we're not dropping samples
		assert.deepEqual(results.samples, array, "Did not return original array as samples");
	});

	it("Computes correct values when dropping samples", () => {
		const array = [20, 20, 20, 20, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0];
		const results = getArrayStatistics(array, 0.5);

		// All these hardcoded values correspond to the statistics of an array with integer samples 1 through 10
		assert.equal(results.arithmeticMean, 5.5, "Computed incorrect mean");
		assert.equal(results.variance, 9.166_666_666_666_666, "Computed incorrect variance");
		assert.equal(
			results.standardDeviation,
			3.027_650_354_097_491_7,
			"Computed incorrect standard deviation",
		);
		assert.equal(
			results.standardErrorOfMean,
			0.957_427_107_756_338_1,
			"Computed incorrect sample error of the mean",
		);
		assert.equal(
			results.marginOfError,
			2.165_700_117_744_836_7,
			"Computed incorrect margin of error",
		);
		assert.equal(
			results.marginOfErrorPercent,
			39.376_365_777_178_854,
			"Computed incorrect relative margin of error",
		);

		// Output array of samples will be sorted if we dropped samples
		const expectedSamples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		assert.deepEqual(
			results.samples,
			expectedSamples,
			"Did not return original array as samples",
		);
	});

	it("Does not mutate array", () => {
		const array = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

		// When not dropping samples
		getArrayStatistics(array);
		assert.deepEqual(
			array,
			[10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
			"Array mutated when not dropping samples",
		);

		// When dropping samples
		getArrayStatistics(array, 0.5);
		assert.deepEqual(
			array,
			[10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
			"Array mutated when dropping samples",
		);
	});

	it("Uses correct samples when dropping an even number", () => {
		const array = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		let results = getArrayStatistics(array, 0.8);
		let expectedSamples = [2, 3, 4, 5, 6, 7, 8, 9];
		assert.equal(
			results.arithmeticMean,
			mean(expectedSamples),
			"Incorrect mean when using 0.8 of samples",
		);
		assert.deepEqual(
			results.samples,
			expectedSamples,
			"Incorrect list of samples when using 0.8 of them",
		);

		results = getArrayStatistics(array, 0.2);
		expectedSamples = [5, 6];
		assert.equal(
			results.arithmeticMean,
			mean(expectedSamples),
			"Incorrect mean when using 0.2 of samples",
		);
		assert.deepEqual(
			results.samples,
			expectedSamples,
			"Incorrect list of samples when using 0.2 of them",
		);
	});

	it("Uses correct samples when dropping an odd number", () => {
		const array = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		let results = getArrayStatistics(array, 0.9);
		let expectedSamples = [1, 2, 3, 4, 5, 6, 7, 8, 9];
		assert.equal(
			results.arithmeticMean,
			mean(expectedSamples),
			"Incorrect mean when using 0.9 of samples",
		);
		assert.deepEqual(
			results.samples,
			expectedSamples,
			"Incorrect list of samples when using 0.9 of them",
		);

		results = getArrayStatistics(array, 0.1);
		expectedSamples = [5];
		assert.equal(
			results.arithmeticMean,
			mean(expectedSamples),
			"Incorrect mean when using 0.1 of samples",
		);
		assert.deepEqual(
			results.samples,
			expectedSamples,
			"Incorrect list of samples when using 0.1 of them",
		);
	});
});

const mean = (array: number[]): number => array.reduce((a, b) => a + b, 0) / array.length;
