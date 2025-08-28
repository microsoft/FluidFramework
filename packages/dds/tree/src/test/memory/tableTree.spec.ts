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
			describe("Column insertion", () => {
				describe("Single column insertion", () => {
					const scenarioName = `Insert a column in the middle ${count} times`;
					runBenchmark({
						title: scenarioName,
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

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});

				describe("Batch column insertion", () => {
					const scenarioName = `Insert ${count} columns in the middle of the table`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.undo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: Array.from({ length: count }, () => new Column({})),
							});
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.redo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});

				// Test the memory usage of inserting a batch of N columns in the middle of the table.
				runBenchmark({
					title: `Insert a batch of ${count} columns in the middle of the table`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						table.insertColumns({
							index: Math.floor(table.columns.length / 2),
							columns: Array.from({ length: count }, () => new Column({})),
						});
					},
				});

				// Test the memory usage of undoing the insertion of a batch of N columns in the middle of the table.
				runBenchmark({
					title: `Undo: insert a batch of ${count} columns in the middle of the table`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						table.insertColumns({
							index: Math.floor(table.columns.length / 2),
							columns: Array.from({ length: count }, () => new Column({})),
						});
						assert(undoRedoManager.canUndo);
					},
					operation: (table, undoRedoManager) => {
						undoRedoManager.undo();
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of redoing the insertion of a batch of N columns in the middle of the table.
				runBenchmark({
					title: `Redo: insert a batch of ${count} columns in the middle of the table`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						table.insertColumns({
							index: Math.floor(table.columns.length / 2),
							columns: Array.from({ length: count }, () => new Column({})),
						});
						assert(undoRedoManager.canUndo);

						undoRedoManager.undo();
						assert(!undoRedoManager.canUndo);
						assert(undoRedoManager.canRedo);
					},
					operation: (table, undoRedoManager) => {
						undoRedoManager.redo();
						assert(!undoRedoManager.canRedo);
					},
				});
			});

			describe("Row insertion", () => {
				describe("Single row insertion", () => {
					const scenarioName = `Insert a row in the middle ${count} times`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = new Row({ cells: {} });
								table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});

				describe("Batch row insertion", () => {
					const scenarioName = `Insert ${count} rows in the middle of the table`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.undo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.insertRows({
								index: Math.floor(table.rows.length / 2),
								rows: Array.from({ length: count }, () => new Row({ cells: {} })),
							});
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.redo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});

				// Test the memory usage of inserting a batch of N rows in the middle of the table.
				runBenchmark({
					title: `Insert a batch of ${count} empty rows in the middle of the table`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						table.insertRows({
							index: Math.floor(table.rows.length / 2),
							rows: Array.from({ length: count }, () => new Row({ cells: {} })),
						});
					},
				});

				// Test the memory usage of undoing the insertion of a batch of empty rows in the middle of the table.
				runBenchmark({
					title: `Undo: insert a batch of ${count} rows in the middle of the table`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						table.insertRows({
							index: Math.floor(table.rows.length / 2),
							rows: Array.from({ length: count }, () => new Row({ cells: {} })),
						});
						assert(undoRedoManager.canUndo);
					},
					operation: (table, undoRedoManager) => {
						undoRedoManager.undo();
						assert(!undoRedoManager.canUndo);
					},
				});

				// Test the memory usage of redoing the insertion of a batch of empty rows in the middle of the table.
				runBenchmark({
					title: `Redo: insert a batch of ${count} rows in the middle of the table`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						table.insertRows({
							index: Math.floor(table.rows.length / 2),
							rows: Array.from({ length: count }, () => new Row({ cells: {} })),
						});
						assert(undoRedoManager.canUndo);

						undoRedoManager.undo();
						assert(!undoRedoManager.canUndo);
						assert(undoRedoManager.canRedo);
					},
					operation: (table, undoRedoManager) => {
						undoRedoManager.redo();
						assert(!undoRedoManager.canRedo);
					},
				});
			});

			describe(`Single column and row insertion`, () => {
				const scenarioName = `Insert a column and a row in the middle ${count} times`;
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle for a given number of times.
				runBenchmark({
					title: scenarioName,
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

				// Test the memory usage of undoing the insertion of a column and a row in the middle N times.
				runBenchmark({
					title: `Undo: ${scenarioName}`,
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
				// runBenchmark({
				// 	title: `Redo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = new Column({});
				// 			table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 			const row = new Row({ id: `row-${i}`, cells: {} });
				// 			table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			// Undo row insertion
				// 			undoRedoManager.undo();
				// 			// Undo column insertion
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Redo column insertion
				// 			undoRedoManager.redo();
				// 			// Redo row insertion
				// 			undoRedoManager.redo();
				// 		}
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// });
			});
		}

		// Set/Remove-related tests that are limited by treeSize
		for (const count of validRemoveCounts) {
			describe("Column removal", () => {
				describe("Single column removal", () => {
					const scenarioName = `Remove a column in the middle ${count} times`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
					// runBenchmark({
					// 	title: `Redo: ${scenarioName}`,
					// 	tableSize,
					// 	initialCellValue,
					// 	beforeOperation: (table, undoRedoManager) => {
					// 		for (let i = 0; i < count; i++) {
					// 			const column = table.columns[Math.floor(table.columns.length / 2)];
					// 			table.removeColumns([column]);
					// 		}
					// 		for (let i = 0; i < count; i++) {
					// 			undoRedoManager.undo();
					// 		}
					// 		assert(!undoRedoManager.canUndo);
					// 	},
					// 	operation: (table, undoRedoManager) => {
					// 		for (let i = 0; i < count; i++) {
					// 			undoRedoManager.redo();
					// 		}
					// 		assert(!undoRedoManager.canRedo);
					// 	},
					// });
				});

				describe("Batch column removal", () => {
					const scenarioName = `Remove ${count} columns from the middle of the table`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.removeColumns(
								Math.floor(table.columns.length / 2) - Math.floor(count / 2),
								count,
							);
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.removeColumns(
								Math.floor(table.columns.length / 2) - Math.floor(count / 2),
								count,
							);
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.undo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.removeColumns(
								Math.floor(table.columns.length / 2) - Math.floor(count / 2),
								count,
							);
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.redo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});
			});

			describe("Row removal", () => {
				describe("Single row removal", () => {
					const scenarioName = `Remove a row in the middle ${count} times`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});

				describe("Batch row removal", () => {
					const scenarioName = `Remove ${count} rows from the middle of the table`;
					runBenchmark({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							table.removeRows(
								Math.floor(table.rows.length / 2) - Math.floor(count / 2),
								count,
							);
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.removeRows(
								Math.floor(table.rows.length / 2) - Math.floor(count / 2),
								count,
							);
							assert(undoRedoManager.canUndo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.undo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							table.removeRows(
								Math.floor(table.rows.length / 2) - Math.floor(count / 2),
								count,
							);
							undoRedoManager.undo();
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (table, undoRedoManager) => {
							undoRedoManager.redo();
						},
						afterOperation: (table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
					});
				});
			});

			describe(`Single column and row removal`, () => {
				const scenarioName = `Remove a column and a row in the middle ${count} times`;
				// Test the memory usage of the SharedTree for removing a column and a row in the middle for a given number of times.
				runBenchmark({
					title: scenarioName,
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

				// Test the memory usage of undoing the removal of a column and a row in the middle N times.
				runBenchmark({
					title: `Undo: ${scenarioName}`,
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
				// runBenchmark({
				// 	title: `Redo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			table.removeColumns([column]);
				// 			const row = table.rows[Math.floor(table.rows.length / 2)];
				// 			table.removeRows([row]);
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			// Undo row removal
				// 			undoRedoManager.undo();
				// 			// Undo column removal
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Redo column removal
				// 			undoRedoManager.redo();
				// 			// Redo row removal
				// 			undoRedoManager.redo();
				// 		}
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// });
			});

			describe(`Insert a column and a row and remove right away`, () => {
				const scenarioName = `Insert a column and a row in the middle and remove right away ${count} times`;
				// Test the memory usage of the SharedTree for inserting a column and a row in the middle and removing them right away for a given number of times.
				runBenchmark({
					title: scenarioName,
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
				// 		title: `Undo: ${scenarioName}`,
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
				// 	title: `Redo: ${scenarioName}`,
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
				const scenarioName = `Set cell value in the middle ${count} times`;
				// Test the memory usage of the SharedTree for setting a cell value in the middle for a given number of times.
				runBenchmark({
					title: scenarioName,
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

				// Test the memory usage of undoing the setting of a cell value in the middle N times.
				runBenchmark({
					title: `Undo: ${scenarioName}`,
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

				// Test the memory usage of redoing the setting of a cell value in the middle N times.
				runBenchmark({
					title: `Redo: ${scenarioName}`,
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
