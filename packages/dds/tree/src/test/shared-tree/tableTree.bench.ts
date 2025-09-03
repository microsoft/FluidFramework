/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
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
	createTableTree,
	type TableBenchmarkOptions,
} from "../tablePerformanceTestUtilities.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedMatrix.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

// TODOs (AB#46340):
// - unify with memory measurement tests (in terms of API)

/**
 * {@link runBenchmark} configuration.
 */
interface BenchmarkConfig extends BenchmarkTimingOptions, TableBenchmarkOptions {
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
				const { table, undoRedoStack, cleanUp } = createTableTree({
					tableSize,
					initialCellValue,
				});

				beforeOperation?.(table, undoRedoStack);

				// Operation
				const before = state.timer.now();
				operation(table, undoRedoStack);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);

				afterOperation?.(table, undoRedoStack);

				// Clean up
				cleanUp();
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

describe("SharedTree table APIs execution time", () => {
	// The value to be set in the cells of the tree.
	const initialCellValue = "cellValue";

	// The test tree's size will be 5*5, 50*50.
	// Table size 1000 benchmarks removed due to high overhead and unreliable results.
	const tableSizes = isInPerformanceTestingMode
		? [5, 50]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	// The number of operations to perform on the tree.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts = isInPerformanceTestingMode
		? [5, 50]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	// The maximum duration for each benchmark, in seconds.
	let maxBenchmarkDurationSeconds: number;

	for (const tableSize of tableSizes) {
		maxBenchmarkDurationSeconds = tableSize === 50 ? 10 : 5;

		// Filter counts to ensure remove operation do not exceed tableSize
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
							assert(undoRedoManager.canRedo);
						},
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
					});
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
					});
				});
			});

			describe(`Single column and row insertion`, () => {
				const scenarioName = `Insert a column and a row in the middle ${count} times`;
				// Test the execute time of the SharedTree for inserting a row and a column in the middle for a given number of times.
				runBenchmark({
					title: scenarioName,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: [column],
							});
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Undo: ${scenarioName}`,
					tableSize,
					initialCellValue,
					beforeOperation: (table, undoRedoManager) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: [column],
							});
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
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
				// 	title: `Redo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			const row = table.rows[Math.floor(table.rows.length / 2)];
				// 			table.removeColumns([column]);
				// 			table.removeRows([row]);
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
				const scenarioName = `Insert a column and a row and remove them right away ${count} times`;
				// Test the execute time of the SharedTree for inserting a row and a column and removing them right away for a given number of times.
				runBenchmark({
					title: scenarioName,
					tableSize,
					initialCellValue,
					operation: (table) => {
						for (let i = 0; i < count; i++) {
							const column = new Column({});
							const row = new Row({ cells: {} });
							table.insertColumns({
								index: Math.floor(table.columns.length / 2),
								columns: [column],
							});
							table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
							table.removeColumns([column]);
							table.removeRows([row]);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				// runBenchmark({
				// 	title: `Undo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = new Column({});
				// 			const row = new Row({ cells: {} });
				// 			table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 			table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 			table.removeColumns([column]);
				// 			table.removeRows([row]);
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
				// 	title: `Redo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = new Column({});
				// 			const row = new Row({ cells: {} });
				// 			table.insertColumns({ index: Math.floor(table.columns.length / 2), columns: [column] });
				// 			table.insertRows({ index: Math.floor(table.rows.length / 2), rows: [row] });
				// 			table.removeColumns([column]);
				// 			table.removeRows([row]);
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
						maxBenchmarkDurationSeconds,
					});

					// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
					// runBenchmark({
					// 	title: `Undo: ${scenarioName}`,
					// 	tableSize,
					// 	initialCellValue,
					// 	beforeOperation: (table, undoRedoManager) => {
					// 		for (let i = 0; i < count; i++) {
					// 			const column = table.columns[Math.floor(table.columns.length / 2)];
					// 			table.removeColumns([column]);
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
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
						maxBenchmarkDurationSeconds,
					});
				});
			});

			describe(`Column and Row Removal`, () => {
				const scenarioName = `Remove a single column and a row in the middle ${count} times`;
				// Test the execute time of the SharedTree for removing a row and a column in the middle for a given number of times.
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
					maxBenchmarkDurationSeconds,
				});

				// TODO: AB#43364: Enable these tests back after allowing SharedTree to support undo/redo for removing cells when a column is removed.
				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				// Test the execute time of undoing remove a row and a column in the middle for a given number of times.
				// runBenchmark({
				// 	title: `Undo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			table.removeColumn(column);
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
				// 	title: `Redo: ${scenarioName}`,
				// 	tableSize,
				// 	initialCellValue,
				// 	beforeOperation: (table, undoRedoManager) => {
				// 		for (let i = 0; i < count; i++) {
				// 			const column = table.columns[Math.floor(table.columns.length / 2)];
				// 			table.removeColumn(column);
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
				const scenarioName = `Set a cell value ${count} times`;
				// Test the execute time of the SharedTree for setting a string in a cell for a given number of times.
				runBenchmark({
					title: scenarioName,
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
					title: `Undo: ${scenarioName}`,
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
					title: `Redo: ${scenarioName}`,
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
