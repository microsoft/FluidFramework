/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import {
	benchmark,
	BenchmarkType,
	isInPerformanceTestingMode,
	type BenchmarkTimer,
} from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { createLocalMatrix } from "../utils.js";

describe("SharedMatrix execution time", () => {
	// The value to be set in the cells of the matrix.
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100.
	// Matrix size 1000 benchmarks removed due to high overhead and unreliable results.
	const matrixSizes = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the matrix.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100, 1000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	let localMatrix: SharedMatrix;
	for (const matrixSize of matrixSizes) {
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure remove operation do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert-related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Insert a column in the middle ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.insertCols(Math.floor(localMatrix.colCount / 2), 1);
							}
							const after = state.timer.now();
							// Measure
							duration = state.timer.toSeconds(before, after);
							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});

				// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Insert a row in the middle ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});

							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.insertRows(Math.floor(localMatrix.rowCount / 2), 1);
							}
							const after = state.timer.now();

							// Measure
							duration = state.timer.toSeconds(before, after);

							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});

				// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Insert a row and a column ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});

							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.insertCols(Math.floor(localMatrix.colCount / 2), 1);
								localMatrix.insertRows(Math.floor(localMatrix.rowCount / 2), 1);
							}
							const after = state.timer.now();

							// Measure
							duration = state.timer.toSeconds(before, after);

							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					// Matrix size 100 benchmarks use increased duration (10s) to improve statistical significance.
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});
			}

			// Set/Remove-related tests that are limited by matrixSize
			for (const count of validRemoveCounts) {
				// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Remove the middle column ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});

							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.removeCols(Math.floor(localMatrix.colCount / 2), 1);
							}
							const after = state.timer.now();

							// Measure
							duration = state.timer.toSeconds(before, after);

							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					// Matrix size 100 benchmarks use increased duration (10s) to improve statistical significance.
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});

				// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Remove the middle row ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});

							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.removeRows(Math.floor(localMatrix.rowCount / 2), 1);
							}
							const after = state.timer.now();

							// Measure
							duration = state.timer.toSeconds(before, after);

							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					// Matrix size 100 benchmarks use increased duration (10s) to improve statistical significance.
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});

				// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Remove the middle row and column ${count} times`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;

						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);

							// Setup
							localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});

							// Operation
							const before = state.timer.now();
							for (let i = 0; i < count; i++) {
								localMatrix.removeCols(Math.floor(localMatrix.colCount / 2), 1);
								localMatrix.removeRows(Math.floor(localMatrix.rowCount / 2), 1);
							}
							const after = state.timer.now();

							// Measure
							duration = state.timer.toSeconds(before, after);

							// Collect data
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
					// Matrix size 100 benchmarks use increased duration (10s) to improve statistical significance.
					maxBenchmarkDurationSeconds: matrixSize === 100 ? 10 : 5,
				});

				// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
				benchmark({
					title: `Set a 3-character string in ${count} cells`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.setCell(i, i, "abc");
						}
					},
				});
			}
		});
	}
});
