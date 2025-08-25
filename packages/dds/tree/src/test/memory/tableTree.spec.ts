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
import type { Test } from "mocha";

import {
	Column,
	Row,
	type UndoRedoManager,
	type Table,
	type TableBenchmarkOptions,
	createTableTree,
} from "../tablePerformanceTestUtilities.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

// TODOs (AB#46340):
// - unify with time measurement tests (in terms of API)

/**
 * Creates a benchmark for operations on a SharedMatrix.
 */
function runBenchmark({
	title,
	tableSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: TableBenchmarkOptions): Test {
	return benchmarkMemory(
		new (class implements IMemoryTestObject {
			public readonly title = title;

			private table: Table | undefined;
			private undoRedoStack: UndoRedoManager | undefined;
			private cleanUp: (() => void) | undefined;

			public async run(): Promise<void> {
				assert(this.table !== undefined, "table is not initialized");
				assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
				operation(this.table, this.undoRedoStack);
			}

			public beforeIteration(): void {
				const { table, undoRedoStack, cleanUp } = createTableTree({
					tableSize,
					initialCellValue,
				});
				this.table = table;
				this.undoRedoStack = undoRedoStack;
				this.cleanUp = cleanUp;

				beforeOperation?.(this.table, this.undoRedoStack);
			}

			public afterIteration(): void {
				assert(this.table !== undefined, "table is not initialized");
				assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
				assert(this.cleanUp !== undefined, "cleanUp is not initialized");

				afterOperation?.(this.table, this.undoRedoStack);

				this.cleanUp();
				this.undoRedoStack = undefined;
				this.cleanUp = undefined;
			}
		})(),
	);
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
				// Test the memory usage of the SharedTree for inserting a column in the middle for a given number of times.
				runBenchmark({
					title: `Insert a column in the middle ${count} times`,
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
				});

				// Test the memory usage of the SharedTree for undoing the insertion of a column in the middle for a given number of times.
				runBenchmark({
					title: `Undo insert column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: [column],
							});
						}
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of the SharedTree for redoing the insertion of a column in the middle for a given number of times.
				runBenchmark({
					title: `Redo insert column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
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
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.redo();
						}
						assert(!undoRedoManager.canRedo);
					},
				});
			});

			describe(`Row Insertion`, () => {
				// Test the memory usage of the SharedTree for inserting a row in the middle for a given number of times.
				runBenchmark({
					title: `Insert a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
						}
					},
				});

				// Test the memory usage of the SharedTree for undoing the insertion of a row at the end for a given number of times.
				runBenchmark({
					title: `Undo insert row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
						}
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of the SharedTree for redoing the insertion of a row in the middle for a given number of times.
				runBenchmark({
					title: `Redo insert row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
						}
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.redo();
						}
						assert(!undoRedoManager.canRedo);
					},
				});
			});

			describe(`Column and Row Insertion`, () => {
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle for a given number of times.

				runBenchmark({
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
				});

				// Test the memory usage of the SharedTree for undoing the insertion of a column and a row in the middle for a given number of times.
				runBenchmark({
					title: `Undo insert column and row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
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
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							// Undo row insertion
							undoRedoManager.undo();
							// Undo column insertion
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the insertion of a column and a row in the middle for a given number of times.
				// 	runBenchmark({
				// 		title: `Redo insert column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		beforeOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row insertion
				// 				undoRedoManager.undo();
				// 				// Undo column insertion
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		operation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Redo column insertion
				// 				undoRedoManager.redo();
				// 				// Redo row insertion
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	},
				// );
			});
		}

		// Set/Remove-related tests that are limited by treeSize
		for (const count of validRemoveCounts) {
			describe(`Column Removal`, () => {
				// Test the memory usage of the SharedTree for removing a column in the middle for a given number of times.
				runBenchmark({
					title: `Remove a column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = table.columns[Math.floor(table.columns.length / 2)];
							table.removeColumns([column]);
						}
					},
				});

				// Test the memory usage of the SharedTree for undoing the removal of a column in the middle for a given number of times.
				runBenchmark({
					title: `Undo remove column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = table.columns[Math.floor(table.columns.length / 2)];
							table.removeColumns([column]);
						}
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the removal of a column in the middle for a given number of times.
				// 	runBenchmark({
				// 		title: `Redo remove column in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		beforeOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				table.removeColumns([column]);
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		operation: (table, undoRedoManager) => {
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
				runBenchmark({
					title: `Remove a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRows([row]);
						}
					},
				});

				// Test the memory usage of the SharedTree for undoing the removal of a row in the middle for a given number of times.
				runBenchmark({
					title: `Undo remove row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRows([row]);
						}
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of the SharedTree for redoing the removal of a row in the middle for a given number of times.
				runBenchmark({
					title: `Redo remove row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRows([row]);
						}
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.redo();
						}
						assert(!undoRedoManager.canRedo);
					},
				});
			});

			describe(`Column and Row Removal`, () => {
				// Test the memory usage of the SharedTree for removing a column and a row in the middle for a given number of times.
				runBenchmark({
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
				});

				// Test the memory usage of the SharedTree for undoing the removal of a column and a row in the middle for a given number of times.
				runBenchmark({
					title: `Undo remove column and row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = table.columns[Math.floor(table.columns.length / 2)];
							table.removeColumns([column]);
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRows([row]);
						}
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							// Undo row removal
							undoRedoManager.undo();
							// Undo column removal
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for redoing the removal of a column and a row in the middle for a given number of times.
				// 	runBenchmark({
				// 		title: `Redo remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		beforeOperation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = table.columns[Math.floor(table.columns.length / 2)];
				// 				table.removeColumns([column]);
				// 				const row = table.rows[Math.floor(table.rows.length / 2)];
				// 				table.removeRows([row]);
				// 			}
				// 			for (let i = 0; i < count; i++) {
				// 				// Undo row removal
				// 				undoRedoManager.undo();
				// 				// Undo column removal
				// 				undoRedoManager.undo();
				// 			}
				// 			assert(!undoRedoManager.canUndo);
				// 		},
				// 		operation: (table, undoRedoManager) => {
				// 			for (let i = 0; i < count; i++) {
				// 				// Redo column removal
				// 				undoRedoManager.redo();
				// 				// Redo row removal
				// 				undoRedoManager.redo();
				// 			}
				// 			assert(!undoRedoManager.canRedo);
				// 		},
				// 	},
				// );
			});

			describe(`Insert a column and a row and remove right away`, () => {
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle and removing them right away for a given number of times.
				runBenchmark({
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
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the memory usage of the SharedTree for undoing the insertion and removal of a column and a row in the middle for a given number of times.
				// 	runBenchmark({
				// 		title: `Undo insert and remove column and row in the middle ${count} times`,
				// 		tableSize,
				// 		initialCellValue,
				// 		beforeOperation: (table) => {
				// 			for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 				table.removeColumns([column]);
				// 				table.removeRows([row]);
				// 			}
				// 		},
				// 		operation: (table, undoRedoManager) => {
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
				// 	},
				// );

				// // Test the memory usage of the SharedTree for redoing the insertion and removal of a column and a row in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Redo insert and remove column and row in the middle ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 				const column = new Column({});
				// 				table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 				const row = new Row({ id: `row-${i}`, cells: {} });
				// 				table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 				table.removeColumns([column]);
				// 				table.removeRows([row]);
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
				// 		operation: (table, undoRedoManager) => {
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
				// 	},
				// );
			});

			describe(`Cell Value Setting`, () => {
				// Test the memory usage of the SharedTree for setting a cell value in the middle for a given number of times.
				runBenchmark({
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
				});

				// Test the memory usage of the SharedTree for undoing the setting of a cell value in the middle for a given number of times.
				runBenchmark({
					title: `Undo set cell value in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table) => {
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
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.undo();
						}
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of the SharedTree for redoing the setting of a cell value in the middle for a given number of times.
				runBenchmark({
					title: `Redo set cell value in the middle ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
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
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							undoRedoManager.redo();
						}
						assert(!undoRedoManager.canRedo);
					},
				});
			});
		}
	}
});
