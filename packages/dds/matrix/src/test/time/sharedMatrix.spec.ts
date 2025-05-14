/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { benchmark, isInPerformanceTestingMode } from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { createLocalMatrix } from "../utils.js";

describe("SharedMatrix execution time", () => {
	// The value to be set in the cells of the matrix.
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100, 1000*1000.
	const matrixSizes = isInPerformanceTestingMode
		? [10, 100, 1000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the matrix.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100, 1000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	let localMatrix: SharedMatrix;
	for (const matrixSize of matrixSizes) {
		beforeEach(() => {
			localMatrix = createLocalMatrix({
				id: "testLocalMatrix",
				size: matrixSize,
				initialValue: matrixValue,
			});
		});
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure remove operation do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
				benchmark({
					title: `Insert a column in the middle ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.insertCols(Math.floor(localMatrix.colCount / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
				benchmark({
					title: `Insert a row in the middle ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.insertRows(Math.floor(localMatrix.rowCount / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
				benchmark({
					title: `Insert a row and a column ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.insertCols(Math.floor(localMatrix.colCount / 2), 1);
							localMatrix.insertRows(Math.floor(localMatrix.rowCount / 2), 1);
						}
					},
				});
			}

			for (const count of validRemoveCounts) {
				// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
				benchmark({
					title: `Remove the middle column ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.removeCols(Math.floor(localMatrix.colCount / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
				benchmark({
					title: `Remove the middle row ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.removeRows(Math.floor(localMatrix.rowCount / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
				benchmark({
					title: `Remove the middle row and column ${count} times`,
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix.removeCols(Math.floor(localMatrix.colCount / 2), 1);
							localMatrix.removeRows(Math.floor(localMatrix.rowCount / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
				benchmark({
					title: `Set a 3-character string in ${count} cells`,
					before: () => {
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
