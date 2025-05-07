/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark } from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { createLocalMatrix } from "../utils.js";

describe("SharedMatrix execution time", () => {
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100, 1000*1000.
	const matrixSizes = [10, 100, 1000];

	// The number of operations to perform on the matrix.
	const operationCounts = [10, 100, 1000];

	let localMatrix: SharedMatrix | undefined;

	beforeEach(async () => {});

	afterEach(() => {});

	for (const matrixSize of matrixSizes) {
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			for (const count of operationCounts) {
				// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
				benchmark({
					title: `Insert a column in the middle ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.insertCols(Math.floor(matrixSize / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
				benchmark({
					title: `Remove a column in the middle ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.removeCols(0, 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
				benchmark({
					title: `Insert a row in the middle ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.insertRows(Math.floor(matrixSize / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
				benchmark({
					title: `Remove a row in the middle ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.removeRows(0, 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
				benchmark({
					title: `Insert a row and a column ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.insertCols(Math.floor(matrixSize / 2), 1);
							localMatrix?.insertRows(Math.floor(matrixSize / 2), 1);
						}
					},
				});

				// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
				benchmark({
					title: `Remove a row and a column ${count} times`,
					before: async () => {
						localMatrix = createLocalMatrix({
							id: "testLocalMatrix",
							size: matrixSize,
							initialValue: matrixValue,
						});
					},
					benchmarkFn: () => {
						for (let i = 0; i < count; i++) {
							localMatrix?.removeCols(0, 1);
							localMatrix?.removeRows(0, 1);
						}
					},
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
							localMatrix?.setCell(i, i, "abc");
						}
					},
				});
			}
		});
	}
});
