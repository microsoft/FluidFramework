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
	type BenchmarkTimingOptions,
} from "@fluid-tools/benchmark";

import {
	Column,
	Row,
	UndoRedoManager,
	createTableTree,
	removeColumnAndCells,
	type Table,
	type TableTreeDefinition,
	type TableTreeOptions,
} from "../tablePerformanceTestUtilities.js";
import type { TreeNodeFromImplicitAllowedTypes } from "../../simple-tree/index.js";
import { Tree } from "../../shared-tree/index.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

/**
 * {@link runBenchmark} configuration.
 */
interface BenchmarkConfig extends BenchmarkTimingOptions, TableTreeOptions {
	/**
	 * The title of the benchmark test.
	 */
	readonly title: string;

	/**
	 * Optional action to perform on the matrix before the operation being measured.
	 */
	readonly beforeOperation?: (
		table: TreeNodeFromImplicitAllowedTypes<typeof Table>,
		undoRedoStack: UndoRedoManager,
	) => void;

	/**
	 * The operation to be measured.
	 */
	readonly operation: (
		table: TreeNodeFromImplicitAllowedTypes<typeof Table>,
		undoRedoStack: UndoRedoManager,
	) => void;

	/**
	 * Optional action to perform on the matrix after the operation being measured.
	 */
	readonly afterOperation?: (
		table: TreeNodeFromImplicitAllowedTypes<typeof Table>,
		undoRedoStack: UndoRedoManager,
	) => void;

	/**
	 * {@inheritDoc @fluid-tools/benchmark#BenchmarkTimingOptions.maxBenchmarkDurationSeconds}
	 */
	readonly maxBenchmarkDurationSeconds: number;
}

/**
 * Runs a benchmark for a specific operation on a table tree.
 */
function runBenchmark({
	title,
	tableSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: BenchmarkConfig): void {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				// Since this setup one collects data from one iteration, assert that this is what is expected.
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Create table tree
				const { table, treeView }: TableTreeDefinition = createTableTree({
					tableSize,
					initialCellValue,
				});

				// Configure event listeners
				const clearEventListener = Tree.on(table, "treeChanged", () => {});

				// Configure undo/redo
				const undoRedoStack = new UndoRedoManager(treeView);

				beforeOperation?.(table, undoRedoStack);

				// Operation
				const before = state.timer.now();
				operation(table, undoRedoStack);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);

				afterOperation?.(table, undoRedoStack);

				// Clean up
				clearEventListener();
				undoRedoStack.dispose();
				treeView.dispose();
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

describe("SharedTree table APIs execution time", () => {
	// The value to be set in the cells of the tree.
	const initialCellValue = "cellValue";

	// The test tree's size will be 10*10, 100*100.
	// Table size 1000 benchmarks removed due to high overhead and unreliable results.
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
	// The maximum duration for each benchmark, in seconds.
	let maxBenchmarkDurationSeconds: number;

	for (const tableSize of tableSizes) {
		maxBenchmarkDurationSeconds = tableSize === 100 ? 10 : 5;

		// Filter counts to ensure remove operation do not exceed tableSize
		const validRemoveCounts = operationCounts.filter((count) => count <= tableSize);

		// Insert-related tests that are not limited by tableSize
		for (const count of operationCounts) {
			describe(`Column Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a column in the middle for a given number of times.
				runBenchmark({
					title: `Insert a column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a column in the middle for a given number of times.
				runBenchmark({
					title: `Undo insert the middle column ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
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
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert column in the middle for a given number of times.
				runBenchmark({
					title: `Redo insert the middle column ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
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
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Row Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a row in the middle for a given number of times.
				runBenchmark({
					title: `Insert a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row in the middle for a given number of times.
				runBenchmark({
					title: `Undo insert the middle row ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
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
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert row in the middle for a given number of times.
				runBenchmark({
					title: `Redo insert the middle row ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = new Row({ cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
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
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Column and Row Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Insert a column and a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Undo insert the middle column and row ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
						assert(undoRedoManager.canUndo);
					},
					operation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							// Undo insert row
							undoRedoManager.undo();
							// Undo insert column
							undoRedoManager.undo();
						}
					},
					afterOperation: (table, undoRedoManager) => {
						assert(!undoRedoManager.canUndo);
					},
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of the SharedTree for redoing a remove row and a column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Redo remove the middle column and row ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			const row = table.rows[Math.floor(table.rows.length / 2)];
				// 			removeColumnAndCells(table, column);
				// 			table.removeRow(row);
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			// Undo remove row
				// 			undoRedoManager.undo();
				// 			// Undo remove column
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 		assert(undoRedoManager.canRedo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Redo insert row
				// 			undoRedoManager.redo();
				// 			// Redo insert column
				// 			undoRedoManager.redo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });
			});

			describe(`Insert a column and a row and remove right away`, () => {
				// Test the execute time of the SharedTree for inserting a row and a column and removing them right away for a given number of times.
				runBenchmark({
					title: `Insert a column and a row and remove them right away ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							removeColumnAndCells(table, column);
							table.removeRow(row);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				// runBenchmark({
				// 	title: `Undo insert the middle column and row ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = new Column({});
				// 			const row = new Row({ cells: {} });
				// 			table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 			table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 			removeColumnAndCells(table, column);
				// 			table.removeRow(row);
				// 		}
				// 		assert(undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Undo remove row
				// 			undoRedoManager.undo();
				// 			// Undo remove column
				// 			undoRedoManager.undo();
				// 			// Undo insert row
				// 			undoRedoManager.undo();
				// 			// Undo insert column
				// 			undoRedoManager.undo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of the SharedTree for redoing an insert row and a column and removing them right away for a given number of times.
				// runBenchmark({
				// 	title: `Redo insert the middle column and row ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = new Column({});
				// 			const row = new Row({ cells: {} });
				// 			table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
				// 			table.insertRow({ index: Math.floor(table.rows.length / 2), row });
				// 			removeColumnAndCells(table, column);
				// 			table.removeRow(row);
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			undoRedoManager.undo();
				// 			undoRedoManager.undo();
				// 			undoRedoManager.undo();
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Redo insert row
				// 			undoRedoManager.redo();
				// 			// Redo insert column
				// 			undoRedoManager.redo();
				// 			// Redo remove row
				// 			undoRedoManager.redo();
				// 			// Redo remove column
				// 			undoRedoManager.redo();
				// 		}
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });
			});
		}

		// Set/Remove-related tests that are limited by tableSize
		for (const count of validRemoveCounts) {
			describe(`Column Removal`, () => {
				// Test the execute time of the SharedTree for removing a column in the middle for a given number of times.
				runBenchmark({
					title: `Remove a column in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = table.columns[Math.floor(table.columns.length / 2)];
							removeColumnAndCells(table, column);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				// Test the execute time of undoing remove a column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Undo remove the middle column ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			removeColumnAndCells(table, column);
				// 		}
				// 		assert(undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			undoRedoManager.undo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of the SharedTree for redoing a remove column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Redo remove the middle column ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			removeColumnAndCells(table, column);
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 		assert(undoRedoManager.canRedo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			undoRedoManager.redo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });
			});

			describe(`Row Removal`, () => {
				// Test the execute time of the SharedTree for removing a row in the middle for a given number of times.
				runBenchmark({
					title: `Remove a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRow(row);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing remove a row in the middle for a given number of times.
				runBenchmark({
					title: `Undo remove the middle row ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRow(row);
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
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing a remove row in the middle for a given number of times.
				runBenchmark({
					title: `Redo remove the middle row ${count} times`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRow(row);
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
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Column and Row Removal`, () => {
				// Test the execute time of the SharedTree for removing a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Remove a column and a row in the middle ${count} times`,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = table.columns[Math.floor(table.columns.length / 2)];
							removeColumnAndCells(table, column);
							const row = table.rows[Math.floor(table.rows.length / 2)];
							table.removeRow(row);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				// Test the execute time of undoing remove a row and a column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Undo remove the middle column and row ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			removeColumnAndCells(table, column);
				// 			const row = table.rows[Math.floor(table.rows.length / 2)];
				// 			table.removeRow(row);
				// 		}
				// 		assert(undoRedoManager.canUndo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Undo remove row
				// 			undoRedoManager.undo();
				// 			// Undo remove column
				// 			undoRedoManager.undo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canUndo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of the SharedTree for redoing a remove row and a column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Redo remove the middle column and row ${count} times`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			removeColumnAndCells(table, column);
				// 			const row = table.rows[Math.floor(table.rows.length / 2)];
				// 			table.removeRow(row);
				// 		}
				// 		for (let i = 0; i < count; i++) {
				// 			undoRedoManager.undo();
				// 			undoRedoManager.undo();
				// 		}
				// 		assert(!undoRedoManager.canUndo);
				// 		assert(undoRedoManager.canRedo);
				// 	},
				// 	operation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			// Redo remove row
				// 			undoRedoManager.redo();
				// 			// Redo remove column
				// 			undoRedoManager.redo();
				// 		}
				// 	},
				// 	afterOperation: (table, undoRedoManager) => {
				// 		assert(!undoRedoManager.canRedo);
				// 	},
				// 	maxBenchmarkDurationSeconds,
				// });
			});

			describe(`Cell Value Setting`, () => {
				// Test the execute time of the SharedTree for setting a string in a cell for a given number of times.
				runBenchmark({
					title: `Set a cell value ${count} times`,
					tableSize,
					initialCellValue: "abc",
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
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing set a cell value for a given number of times.
				runBenchmark({
					title: `Undo set a cell value ${count} times`,
					tableSize,
					initialCellValue: "abc",
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
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing a set cell value for a given number of times.
				runBenchmark({
					title: `Redo set a cell value ${count} times`,
					tableSize,
					initialCellValue: "abc",
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
					maxBenchmarkDurationSeconds,
				});
			});
		}
	}
});
