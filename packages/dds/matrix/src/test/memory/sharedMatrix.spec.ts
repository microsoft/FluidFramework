/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IMemoryTestObject, benchmarkMemory } from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { createLocalMatrix } from "../utils.js";

describe("SharedMatrix memory usage", () => {
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100, 1000*1000.
	const matrixSizes = [10, 100, 1000];

	// The number of operations to perform on the matrix.
	const operationCounts = [10, 100, 1000];

	beforeEach(async () => {});

	afterEach(() => {});

	for (const matrixSize of matrixSizes) {
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			for (const count of operationCounts) {
				// Test the memory usage of the SharedMatrix for inserting a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a column in the middle ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.insertCols(Math.floor(matrixSize / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for removing a column for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove the first column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.removeCols(0, 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for inserting a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a row in the middle ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.insertRows(Math.floor(matrixSize / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for removing a row for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove the first row ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.removeRows(0, 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a row and a column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.insertCols(Math.floor(matrixSize / 2), 1);
								this.localMatrix?.insertRows(Math.floor(matrixSize / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for removing a row and a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove a row and a column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.removeCols(0, 1);
								this.localMatrix?.removeRows(0, 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for setting a string in a cell for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Set a 3-character string in ${count} cells`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							for (let i = 0; i < count; i++) {
								this.localMatrix?.setCell(i, i, "abc");
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);
			}
		});
	}
});
