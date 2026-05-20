/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkMode,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	currentBenchmarkMode,
	memoryAddedBy,
} from "@fluid-tools/benchmark";

// eslint-disable-next-line import-x/no-internal-modules
import { iterationSettings } from "./memory/utils.js";
import {
	Column,
	Row,
	type TableBenchmarkOptions,
	createTableTree,
} from "./tablePerformanceTestUtilities.js";
import { configureBenchmarkHooks } from "./utils.js";

interface BenchmarkConfig extends TableBenchmarkOptions {
	readonly maxBenchmarkDurationSeconds: number;
}

function runExecutionTimeBenchmark({
	maxBenchmarkDurationSeconds,
	title,
	tableSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: BenchmarkConfig): void {
	benchmarkIt({
		title,
		...benchmarkDurationBatchless({
			benchmarkFn: (state) => {
				let running: boolean;
				do {
					const { table, undoRedoStack, cleanUp } = createTableTree({
						tableSize,
						initialCellValue,
					});
					beforeOperation?.(table, undoRedoStack);
					running = state.time(() => {
						operation(table, undoRedoStack);
					});
					afterOperation?.(table, undoRedoStack);
					cleanUp();
				} while (running);
			},
			maxBenchmarkDurationSeconds,
		}),
	});
}

function runMemoryBenchmark({
	title,
	tableSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: BenchmarkConfig): void {
	benchmarkIt({
		title,
		...benchmarkMemoryUse({
			...iterationSettings,
			...memoryAddedBy({
				setup: () => {
					const result = createTableTree({ tableSize, initialCellValue });
					beforeOperation?.(result.table, result.undoRedoStack);
					return result;
				},
				modify: ({ table, undoRedoStack }) => {
					operation(table, undoRedoStack);
				},
				after: ({ table, undoRedoStack, cleanUp }) => {
					afterOperation?.(table, undoRedoStack);
					cleanUp();
				},
			}),
		}),
	});
}

function runBenchmarks(options: BenchmarkConfig): void {
	runExecutionTimeBenchmark(options);
	runMemoryBenchmark(options);
}

/**
 * Shared test suite for table tree execution time and memory benchmarks.
 *
 * @remarks
 * Note: These benchmarks are designed to closely match the SharedMatrix benchmarks in the `matrix` package.
 * If you modify or add tests here, consider updating the corresponding SharedMatrix benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 *
 * TODO: AB#71782: Investigate why these tests are so slow / possibly contain cross-test contamination and address those issue, then re-enable these tests.
 */
describe.skip("TableSchema Benchmarks", () => {
	configureBenchmarkHooks();

	// The value to be set in the cells of the tree.
	const initialCellValue = "cellValue";

	// The test tree's size will be 5*5, 50*50.
	// Table size 1000 benchmarks removed due to high overhead and unreliable results.
	const tableSizes =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [5, 50]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[3];

	// The number of operations to perform on the tree.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [5, 50]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[3];

	let maxBenchmarkDurationSeconds: number;

	for (const tableSize of tableSizes) {
		describe(`Table size: ${tableSize}`, () => {
			maxBenchmarkDurationSeconds = tableSize === 50 ? 10 : 5;

			// Filter counts to ensure remove operations do not exceed tableSize
			const validRemoveCounts = operationCounts.filter((count) => count <= tableSize);

			// Insert-related tests that are not limited by tableSize
			for (const count of operationCounts) {
				describe("Column insertion", () => {
					describe("Single column insertion", () => {
						const scenarioName = `Insert a column in the middle ${count} times`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.redo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch column insertion", () => {
						const scenarioName = `Insert ${count} columns in the middle of the table`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.undo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
								assert(undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.redo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe("Row insertion", () => {
					describe("Single row insertion", () => {
						const scenarioName = `Insert a row in the middle ${count} times`;
						runBenchmarks({
							title: scenarioName,
							tableSize,
							initialCellValue,
							operation: (table) => {
								for (let i = 0; i < count; i++) {
									const row = new Row({ cells: {} });
									table.insertRows({
										index: Math.floor(table.rows.length / 2),
										rows: [row],
									});
								}
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Undo: ${scenarioName}`,
							tableSize,
							initialCellValue,
							beforeOperation: (table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									const row = new Row({ cells: {} });
									table.insertRows({
										index: Math.floor(table.rows.length / 2),
										rows: [row],
									});
								}
								assert(undoRedoManager.canUndo);
							},
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							tableSize,
							initialCellValue,
							beforeOperation: (table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									const row = new Row({ cells: {} });
									table.insertRows({
										index: Math.floor(table.rows.length / 2),
										rows: [row],
									});
								}
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
								assert(!undoRedoManager.canUndo);
								assert(undoRedoManager.canRedo);
							},
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.redo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch row insertion", () => {
						const scenarioName = `Insert ${count} rows in the middle of the table`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.undo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
								assert(undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.redo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe(`Single column and row insertion`, () => {
					const scenarioName = `Insert a column and a row in the middle ${count} times`;
					runBenchmarks({
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
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
							}
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Undo insert row
								undoRedoManager.undo();
								// Undo insert column
								undoRedoManager.undo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
							}
							for (let i = 0; i < count; i++) {
								// Undo insert row
								undoRedoManager.undo();
								// Undo insert column
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Redo insert column
								undoRedoManager.redo();
								// Redo insert row
								undoRedoManager.redo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Insert a column and a row and remove right away`, () => {
					const scenarioName = `Insert a column and a row and remove them right away ${count} times`;
					runBenchmarks({
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
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
								table.removeColumns([column]);
								table.removeRows([row]);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
								table.removeColumns([column]);
								table.removeRows([row]);
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Undo remove row
								undoRedoManager.undo();
								// Undo remove column
								undoRedoManager.undo();
								// Undo insert row
								undoRedoManager.undo();
								// Undo insert column
								undoRedoManager.undo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
								const row = new Row({ id: `row-${i}`, cells: {} });
								table.insertRows({
									index: Math.floor(table.rows.length / 2),
									rows: [row],
								});
								table.removeColumns([column]);
								table.removeRows([row]);
							}
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
								undoRedoManager.undo();
								undoRedoManager.undo();
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Redo insert column
								undoRedoManager.redo();
								// Redo insert row
								undoRedoManager.redo();
								// Redo remove column
								undoRedoManager.redo();
								// Redo remove row
								undoRedoManager.redo();
							}
							assert(!undoRedoManager.canRedo);
						},
						maxBenchmarkDurationSeconds,
					});
				});
			}

			// Set/Remove-related tests that are limited by tableSize
			for (const count of validRemoveCounts) {
				describe("Column removal", () => {
					describe("Single column removal", () => {
						const scenarioName = `Remove a column in the middle ${count} times`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							tableSize,
							initialCellValue,
							beforeOperation: (table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									const column = table.columns[Math.floor(table.columns.length / 2)];
									table.removeColumns([column]);
								}
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
								assert(!undoRedoManager.canUndo);
								assert(undoRedoManager.canRedo);
							},
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.redo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch column removal", () => {
						const scenarioName = `Remove ${count} columns from the middle of the table`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.undo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.redo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe("Row removal", () => {
					describe("Single row removal", () => {
						const scenarioName = `Remove a row in the middle ${count} times`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.undo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								for (let i = 0; i < count; i++) {
									undoRedoManager.redo();
								}
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch row removal", () => {
						const scenarioName = `Remove ${count} rows from the middle of the table`;
						runBenchmarks({
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

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.undo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canUndo);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							operation: (_table, undoRedoManager) => {
								undoRedoManager.redo();
							},
							afterOperation: (_table, undoRedoManager) => {
								assert(!undoRedoManager.canRedo);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe(`Column and Row Removal`, () => {
					const scenarioName = `Remove a single column and a row in the middle ${count} times`;
					runBenchmarks({
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

					runBenchmarks({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Undo remove row
								undoRedoManager.undo();
								// Undo remove column
								undoRedoManager.undo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.removeColumns([column]);
								const row = table.rows[Math.floor(table.rows.length / 2)];
								table.removeRows([row]);
							}
							for (let i = 0; i < count; i++) {
								// Undo remove row
								undoRedoManager.undo();
								// Undo remove column
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								// Redo remove column
								undoRedoManager.redo();
								// Redo remove row
								undoRedoManager.redo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Cell Value Setting`, () => {
					const scenarioName = `Set a cell value ${count} times`;
					runBenchmarks({
						title: scenarioName,
						tableSize,
						initialCellValue,
						operation: (table) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: { row: row.id, column: column.id },
									cell: initialCellValue,
								});
							}
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
						title: `Undo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: { row: row.id, column: column.id },
									cell: initialCellValue,
								});
							}
							assert(undoRedoManager.canUndo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canUndo);
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
						title: `Redo: ${scenarioName}`,
						tableSize,
						initialCellValue,
						beforeOperation: (table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								const row = table.rows[Math.floor(table.rows.length / 2)];
								const column = table.columns[Math.floor(table.columns.length / 2)];
								table.setCell({
									key: { row: row.id, column: column.id },
									cell: initialCellValue,
								});
							}
							for (let i = 0; i < count; i++) {
								undoRedoManager.undo();
							}
							assert(!undoRedoManager.canUndo);
							assert(undoRedoManager.canRedo);
						},
						operation: (_table, undoRedoManager) => {
							for (let i = 0; i < count; i++) {
								undoRedoManager.redo();
							}
						},
						afterOperation: (_table, undoRedoManager) => {
							assert(!undoRedoManager.canRedo);
						},
						maxBenchmarkDurationSeconds,
					});
				});
			}
		});
	}
});
