/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
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
	type Table,
	type TableTreeOptions,
} from "../tablePerformanceTestUtilities.js";
import type { TreeNodeFromImplicitAllowedTypes } from "../../simple-tree/index.js";
import { Tree } from "../../shared-tree/index.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

// TODOs (AB#46340):
// - single helper function with before and after hooks for setup and teardown
// - unify with time measurement tests (in terms of API)

/**
 * Initializes a SharedMatrix for testing.
 * @remarks Includes initialization of the undo/redo stack, as well as mock event subscriptions.
 */
function createTable(options: TableTreeOptions): {
	/**
	 * The initialized table tree.
	 */
	table: TreeNodeFromImplicitAllowedTypes<typeof Table>;

	/**
	 * The undo/redo stack manager for the table.
	 */
	undoRedoStack: UndoRedoManager;

	/**
	 * Cleanup function to run after the test to close the table and release resources.
	 */
	cleanUp: () => void;
} {
	const { table, treeView } = createTableTree(options);

	// Configure event listeners
	const cleanUpEventHandler = Tree.on(table, "treeChanged", () => {});

	// Configure undo/redo
	const undoRedoStack = new UndoRedoManager(treeView);

	const cleanUp = (): void => {
		cleanUpEventHandler();
		undoRedoStack.dispose();
		treeView.dispose();
	};

	return {
		table,
		undoRedoStack,
		cleanUp,
	};
}

/**
 * {@link createBenchmark} options.
 */
interface BenchmarkOptions extends TableTreeOptions {
	/**
	 * The title of the benchmark test.
	 */
	readonly title: string;

	/**
	 * The operation to be measured.
	 */
	readonly operation: (table: TreeNodeFromImplicitAllowedTypes<typeof Table>) => void;
}

/**
 * Creates a benchmark for operations on a SharedMatrix.
 */
function createBenchmark({
	title,
	tableSize,
	initialCellValue,
	operation,
}: BenchmarkOptions): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		public readonly title = title;

		private table: TreeNodeFromImplicitAllowedTypes<typeof Table> | undefined;
		private cleanUp: (() => void) | undefined;

		public async run(): Promise<void> {
			assert(this.table !== undefined, "table is not initialized");
			operation(this.table);
		}

		public beforeIteration(): void {
			const { table, cleanUp } = createTable({
				tableSize,
				initialCellValue,
			});
			this.table = table;
			this.cleanUp = cleanUp;
		}

		public afterIteration(): void {
			assert(this.cleanUp !== undefined, "cleanUp is not initialized");

			this.cleanUp();
			this.table = undefined;
			this.cleanUp = undefined;
		}
	})();
}

/**
 * Creates a benchmark for undo/redo operations on a SharedTree.
 */
function createUndoRedoBenchmark({
	title,
	tableSize,
	initialCellValue,
	setupOperation,
	stackOperation,
}: {
	title: string;
	tableSize: number;
	initialCellValue: string;
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

		private table: TreeNodeFromImplicitAllowedTypes<typeof Table> | undefined;
		private undoRedoStack: UndoRedoManager | undefined;
		private cleanUp: (() => void) | undefined;

		public async run(): Promise<void> {
			assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
			stackOperation(this.undoRedoStack);
		}

		public beforeIteration(): void {
			const { table, undoRedoStack, cleanUp } = createTable({
				tableSize,
				initialCellValue,
			});
			this.table = table;
			this.undoRedoStack = undoRedoStack;
			this.cleanUp = cleanUp;

			setupOperation(this.table, this.undoRedoStack);
		}

		public afterIteration(): void {
			assert(this.cleanUp !== undefined, "cleanUp is not initialized");

			this.cleanUp();
			this.table = undefined;
			this.undoRedoStack = undefined;
			this.cleanUp = undefined;
		}
	})();
}

describe("SharedTree table APIs memory usage", () => {
	// The value to be set in the cells of the tree.
	const initialCellValue = "cellValue";

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
				// Test the memory usage of inserting a single column in the middle of the table N times.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a single column in the middle ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
								});
							}
						},
					}),
				);

				// Test the memory usage of undoing the insertion of a single column in the middle of the table N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: insert a single column in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
								});
							}
							assert(undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of redoing the insertion of a single column in the middle of a table N of times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo: insert a single column in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
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

				// Test the memory usage of inserting a batch of N columns in the middle of the table.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a batch of ${count} columns in the middle of the table`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
						},
					}),
				);

				// Test the memory usage of undoing the insertion of a batch of N columns in the middle of the table.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: insert a batch of ${count} columns in the middle of the table`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
							assert(undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of redoing the insertion of a batch of N columns in the middle of the table.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo: insert a batch of ${count} columns in the middle of the table`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
							assert(undoRedoManager.canUndo);

							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						stackOperation: (undoRedoManager) => {
							undoRedoManager.redo();
							assert(!undoRedoManager.canRedo);
						},
					}),
				);
			});

			describe(`Row Insertion`, () => {
				// Test the memory usage of inserting a single empty row in the middle of the table N times.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
							}
						},
					}),
				);

				// Test the memory usage of undoing the insertion of a single empty row in the middle of the table N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: insert row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
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

				// Test the memory usage of redoing the insertion of a single empty row in the middle of the table N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo: insert row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
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

				// Test the memory usage of inserting a batch of N rows in the middle of the table.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a batch of ${count} empty rows in the middle of the table`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
						},
					}),
				);

				// Test the memory usage of undoing the insertion of a batch of empty rows in the middle of the table.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: insert a batch of ${count} rows in the middle of the table`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
							assert(undoRedoManager.canUndo);
						},
						stackOperation: (undoRedoManager) => {
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
						},
					}),
				);

				// Test the memory usage of redoing the insertion of a batch of empty rows in the middle of the table.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo: insert a batch of ${count} rows in the middle of the table`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
							assert(undoRedoManager.canUndo);

							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						stackOperation: (undoRedoManager) => {
							undoRedoManager.redo();
							assert(!undoRedoManager.canRedo);
						},
					}),
				);
			});

			describe(`Column and Row Insertion`, () => {
				// Test the memory usage of inserting a column and a row in the middle N times.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a column and a row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
								});
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
							}
						},
					}),
				);

				// Test the memory usage of undoing the insertion of a column and a row in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo insert column and row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
								});
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
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
				// Test the memory usage of redoing the insertion of a column and a row in the middle N times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo insert column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
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
				// Test the memory usage of removing a column in the middle N times.
				benchmarkMemory(
					createBenchmark({
						title: `Remove the middle column ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
							}
						},
					}),
				);

				// Test the memory usage of undoing the removal of a column in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: remove the middle column ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
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
				// Test the memory usage of redoing the removal of a column in the middle N times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo: remove the middle column ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				table.removeColumn(column);
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
				// Test the memory usage of removing a row in the middle N times.
				benchmarkMemory(
					createBenchmark({
						title: `Remove the middle row ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
						},
					}),
				);

				// Test the memory usage of undoing the removal of a row in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo: remove the middle row ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
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

				// Test the memory usage of redoing the removal of a row in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo: remove the middle row ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
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
				// Test the memory usage of removing a column and a row in the middle N times.
				benchmarkMemory(
					createBenchmark({
						title: `Remove a column and a row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
						},
					}),
				);

				// Test the memory usage of undoing the removal of a column and a row in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo remove column and row in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
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
				// Test the memory usage of redoing the removal of a column and a row in the middle N times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				table.removeColumn(column);
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
				// Test the memory usage of inserting a column and a row in the middle and removing them right away N times.
				benchmarkMemory(
					createBenchmark({
						title: `Insert a column and a row in the middle and remove right away ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = new Column({});
								table.insertColumns({
									index: Math.floor(table.columns.length / 2),
									columns: [column],
								});

								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });

								table.removeColumns([column]);
								table.removeRows([row]);
							}
						},
					}),
				);

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of undoing the insertion and removal of a column and a row in the middle N times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Undo insert and remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		setupOperation: (table) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 				table.removeColumn(column);
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

				// // Test the memory usage of redoing the insertion and removal of a column and a row in the middle N times.
				// benchmarkMemory(
				// 	createUndoRedoBenchmark({
				// 		title: `Redo insert and remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		setupOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 				table.removeColumn(column);
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
				// Test the memory usage of setting a cell value in the middle N times.
				benchmarkMemory(
					createBenchmark({
						title: `Set cell value in the middle ${count} times`,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: initialCellValue,
								});
							}
						},
					}),
				);

				// Test the memory usage of undoing the setting of a cell value in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Undo set cell value in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: initialCellValue,
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

				// Test the memory usage of redoing the setting of a cell value in the middle N times.
				benchmarkMemory(
					createUndoRedoBenchmark({
						title: `Redo set cell value in the middle ${count} times`,
						tableSize,
						initialCellValue,
						setupOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: {
										row: row.id,
										column: column.id,
									},
									cell: initialCellValue,
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
