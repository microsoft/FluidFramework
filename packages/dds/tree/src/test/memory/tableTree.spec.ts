/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import {
	benchmarkMemory,
	isInPerformanceTestingMode,
	type IMemoryTestObject,
} from "@fluid-tools/benchmark";

import {
	Column,
	Row,
	UndoRedoManager,
	createTableTree,
	removeColumnAndCells,
	type TableTreeDefinition,
} from "../tablePerformanceTestUtilities.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

/**
 * Creates a benchmark for undo operations on a SharedTree.
 */
function createUndoBenchmark({
	title,
	tableSize,
	initialValue,
	operationCount,
	editsPerOperation,
	operation,
}: {
	title: string;
	tableSize: number;
	initialValue: string;
	operationCount: number;
	editsPerOperation: number;
	operation: (tree: TableTreeDefinition, count: number) => void;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		public readonly title = title;
		private localTree: TableTreeDefinition | undefined;
		private undoRedoManager: UndoRedoManager | undefined;

		public async run(): Promise<void> {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			for (let i = 0; i < operationCount * editsPerOperation; i++) {
				this.undoRedoManager.undo();
			}
			assert(!this.undoRedoManager.canUndo);
		}

		public beforeIteration(): void {
			this.localTree = createTableTree(tableSize, initialValue);
			this.undoRedoManager = new UndoRedoManager(this.localTree.treeView);
			operation(this.localTree, operationCount);
		}

		public afterIteration(): void {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			// Clear the undo stack after each iteration.
			this.undoRedoManager.dispose();
		}
	})();
}

/**
 * Creates a benchmark for redo operations on a SharedTree.
 */
function createRedoBenchmark({
	title,
	tableSize,
	initialValue,
	operationCount,
	editsPerOperation,
	operation,
}: {
	title: string;
	tableSize: number;
	initialValue: string;
	operationCount: number;
	editsPerOperation: number;
	operation: (tree: TableTreeDefinition, count: number) => void;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		public readonly title = title;
		private localTree: TableTreeDefinition | undefined;
		private undoRedoManager: UndoRedoManager | undefined;

		public async run(): Promise<void> {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			for (let i = 0; i < operationCount * editsPerOperation; i++) {
				this.undoRedoManager.redo();
			}
			assert(!this.undoRedoManager.canRedo);
		}

		public beforeIteration(): void {
			this.localTree = createTableTree(tableSize, initialValue);
			this.undoRedoManager = new UndoRedoManager(this.localTree.treeView);
			operation(this.localTree, operationCount);
			for (let i = 0; i < operationCount * editsPerOperation; i++) {
				this.undoRedoManager.undo();
			}
			assert(!this.undoRedoManager.canUndo);
		}

		public afterIteration(): void {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			// Clear the redo stack after each iteration.
			this.undoRedoManager.dispose();
		}
	})();
}

describe("SharedTree table APIs memory usage", () => {
	// The value to be set in the cells of the tree.
	const cellValue = "cellValue";
	// The test tree's size will be 10*10, 100*100.
	// Tree size 1000 benchmarks removed due to high overhead and unreliable results.
	const tableSizes = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the tree.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	// IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
	// because they won't be out of scope when we garbage-collect between runs of the same test,
	// and that will skew measurements. Tests should allocate all the memory they need using local
	// variables scoped to the test function itself, so several iterations of a given test can
	// measure from the same baseline (as much as possible).

	beforeEach(async () => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompassing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	afterEach(() => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompassing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	for (const tableSize of tableSizes) {
		// Filter counts to ensure they do not exceed tableSize
		const validRemoveCounts = operationCounts.filter((count) => count <= tableSize);

		// Insert-related tests that are not limited by tableSize
		for (const count of operationCounts) {
			describe(`Column Insertion`, () => {
				// Test the memory usage of the SharedTree for inserting a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Insert a column in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the insertion of a column in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion of a column in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							}
						},
					}),
				);
			});

			describe(`Row Insertion`, () => {
				// Test the memory usage of the SharedTree for inserting a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Insert a row in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the insertion of a row at the end for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = new Row({ cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion of a row in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = new Row({ cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
					}),
				);
			});

			describe(`Column and Row Insertion`, () => {
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Insert a column and a row in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the insertion of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 2,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 2,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
					}),
				);
			});
		}

		// Set/Remove-related tests that are limited by treeSize
		for (const count of validRemoveCounts) {
			describe(`Column Removal`, () => {
				// Test the memory usage of the SharedTree for removing a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Remove a column in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the removal of a column in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the removal of a column in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
							}
						},
					}),
				);
			});

			describe(`Row Removal`, () => {
				// Test the memory usage of the SharedTree for removing a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Remove a row in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the removal of a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the removal of a row in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
					}),
				);
			});

			describe(`Column and Row Removal`, () => {
				// Test the memory usage of the SharedTree for removing a column and a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Remove a column and a row in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the removal of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 2,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the removal of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 2,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
					}),
				);
			});

			describe(`Insert a column and a row and remove right away`, () => {
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle and removing them right away for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title =
							`Insert a column and a row in the middle and remove right away ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
								removeColumnAndCells(table, column);
								table.removeRow(row);
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the insertion and removal of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert and remove column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 4,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
								removeColumnAndCells(table, column);
								table.removeRow(row);
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion and removal of a column and a row in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert and remove column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 4,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
								removeColumnAndCells(table, column);
								table.removeRow(row);
							}
						},
					}),
				);
			});

			describe(`Cell Value Setting`, () => {
				// Test the memory usage of the SharedTree for setting a cell value in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title = `Set cell value in the middle ${count} times`;
						private localTree: TableTreeDefinition | undefined;

						public async run(): Promise<void> {
							assert(this.localTree !== undefined, "localTree is not initialized");
							const { table } = this.localTree;
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: cellValue,
								});
							}
						}

						public beforeIteration(): void {
							this.localTree = createTableTree(tableSize, cellValue);
						}
					})(),
				);

				// Test the memory usage of the SharedTree for undoing the setting of a cell value in the middle for a given number of times.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo set cell value in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: cellValue,
								});
							}
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the setting of a cell value in the middle for a given number of times.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo set cell value in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						operationCount: count,
						editsPerOperation: 1,
						operation: (tree, operationCount) => {
							const { table } = tree;
							for (let i = 0; i < operationCount; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: cellValue,
								});
							}
						},
					}),
				);
			});
		}
	}
});
