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
	type Table,
	type TableTreeDefinition,
} from "../tablePerformanceTestUtilities.js";
import type { TreeNodeFromImplicitAllowedTypes } from "../../simple-tree/index.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

/**
 * Creates a benchmark for undo/redo operations on a SharedTree.
 */
function createUndoRedoBenchmark({
	title,
	tableSize,
	initialValue,
	setupOperation,
	stackOperation,
}: {
	title: string;
	tableSize: number;
	initialValue: string;
	/**
	 * A function that sets up the operation to be performed on the tree.
	 */
	setupOperation: (
		table: TreeNodeFromImplicitAllowedTypes<typeof Table>,
		undoRedoManager: UndoRedoManager,
	) => void;
	/**
	 * The operation to perform on the stack. This should be a function that takes an UndoRedoStackManager
	 * and performs the desired operation.
	 */
	stackOperation: (undoRedoManager: UndoRedoManager) => void;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		public readonly title = title;
		private localTree: TableTreeDefinition | undefined;
		private undoRedoManager: UndoRedoManager | undefined;

		public async run(): Promise<void> {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			stackOperation(this.undoRedoManager);
		}

		public beforeIteration(): void {
			this.localTree = createTableTree(tableSize, initialValue);
			this.undoRedoManager = new UndoRedoManager(this.localTree.treeView);
			setupOperation(this.localTree.table, this.undoRedoManager);
		}

		public afterIteration(): void {
			assert(this.undoRedoManager !== undefined, "undoRedoManager is not initialized");
			// Clear the undo stack after each iteration.
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
					createUndoRedoBenchmark({
						title: `Undo insert column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion of a column in the middle for a given number of times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo insert column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							}
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
							assert(!undoRedoManager.canRedo);
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
					createUndoRedoBenchmark({
						title: `Undo insert row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the insertion of a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo insert row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
							assert(!undoRedoManager.canRedo);
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
					createUndoRedoBenchmark({
						title: `Undo insert column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Undo row insertion
								undoRedoManager.undo();
								// Undo column insertion
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the insertion of a column and a row in the middle for a given number of times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo insert column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialValue: cellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row insertion
				// 				undoRedoManager.undo();
				// 				// Undo column insertion
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		stackOperation: (undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Redo column insertion
				// 				undoRedoManager.redo();
				// 				// Redo row insertion
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	}),
				// );
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
					createUndoRedoBenchmark({
						title: `Undo remove column in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the removal of a column in the middle for a given number of times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo remove column in the middle ${count} times`,
				// 		tableSize,
				// 		initialValue: cellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				removeColumnAndCells(table, column);
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		stackOperation: (undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	}),
				// );
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
					createUndoRedoBenchmark({
						title: `Undo remove row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the removal of a row in the middle for a given number of times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo remove row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
							assert(!undoRedoManager.canRedo);
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
					createUndoRedoBenchmark({
						title: `Undo remove column and row in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								removeColumnAndCells(table, column);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRow(row);
							}
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Undo row removal
								undoRedoManager.undo();
								// Undo column removal
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the removal of a column and a row in the middle for a given number of times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialValue: cellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				removeColumnAndCells(table, column);
				// 				const row = table.rows[Math.floor(table.rows.length / 2)];
				// 				table.removeRow(row);
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row removal
				// 				undoRedoManager.undo();
				// 				// Undo column removal
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		stackOperation: (undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Redo column removal
				// 				undoRedoManager.redo();
				// 				// Redo row removal
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	}),
				// );
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

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for undoing the insertion and removal of a column and a row in the middle for a given number of times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Undo insert and remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialValue: cellValue,
				// 		setupOperation: (table) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 				removeColumnAndCells(table, column);
				// 				table.removeRow(row);
				// 			}
				// 		},
				// 		stackOperation: (undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row removal
				// 				undoRedoManager.undo();
				// 				// Undo column removal
				// 				undoRedoManager.undo();
				// 				// Undo row insertion
				// 				undoRedoManager.undo();
				// 				// Undo column insertion
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 	}),
				// );

				// // Test the memory usage of the SharedTree for redoing the insertion and removal of a column and a row in the middle for a given number of times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo insert and remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialValue: cellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 				removeColumnAndCells(table, column);
				// 				table.removeRow(row);
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row removal
				// 				undoRedoManager.undo();
				// 				// Undo column removal
				// 				undoRedoManager.undo();
				// 				// Undo row insertion
				// 				undoRedoManager.undo();
				// 				// Undo column insertion
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		stackOperation: (undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Redo column insertion
				// 				undoRedoManager.redo();
				// 				// Redo row insertion
				// 				undoRedoManager.redo();
				// 				// Redo column removal
				// 				undoRedoManager.redo();
				// 				// Redo row removal
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	}),
				// );
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
					createUndoRedoBenchmark({
						title: `Undo set cell value in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table) => {
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
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of the SharedTree for redoing the setting of a cell value in the middle for a given number of times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo set cell value in the middle ${count} times`,
						tableSize,
						initialValue: cellValue,
						setupOperation: (table, undoRedoManager) => {
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
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
							assert(!undoRedoManager.canRedo);
						},
					}),
				);
			});
		}
	}
});
