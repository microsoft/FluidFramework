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
} from "@fluid-tools/benchmark";

import { v4 as uuid } from "uuid";
import { createTableTree, type TableTreeDefinition } from "../testHelper.js";

/**
 * This file contains benchmarks for measuring the execution time of operations on table SharedTree.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function runBenchmark({
	title,
	tableSize,
	cellValue,
	operation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: {
	title: string;
	tableSize: number;
	cellValue: string;
	operation: (tree: TableTreeDefinition) => void;
	minBatchDurationSeconds?: number;
	maxBenchmarkDurationSeconds: number;
}) {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Setup
				const localTree: TableTreeDefinition = createTableTree(tableSize, cellValue);

				// Operation
				const before = state.timer.now();
				operation(localTree);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

/**
 * This function runs a benchmark for undo/redo operations on a SharedTree.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function runUndoRedoBenchmark({
	title,
	tableSize,
	cellValue,
	setupOperation,
	stackOperation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: {
	title: string;
	tableSize: number;
	cellValue: string;
	/**
	 * A function that sets up the operation to be performed on the tree.
	 */
	setupOperation: (tree: TableTreeDefinition) => void;
	/**
	 * The operation to perform on the stack. This should be a function that takes an UndoRedoStackManager
	 * and performs the desired operation.
	 */
	stackOperation: (tree: TableTreeDefinition) => void;
	minBatchDurationSeconds?: number;
	maxBenchmarkDurationSeconds: number;
}) {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Setup
				const localTree: TableTreeDefinition = createTableTree(tableSize, cellValue);
				setupOperation(localTree);

				// Operation
				const before = state.timer.now();
				stackOperation(localTree);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);

				// Cleanup
				localTree.unsubscribe();
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

describe("SharedTree execution time", () => {
	// The value to be set in the cells of the tree.
	const cellValue = "cellValue";
	// The test tree's size will be 10*10, 100*100.
	// Tree size 1000 benchmarks removed due to high overhead and unreliable results.
	const treeSizes = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the tree.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];
	let maxBenchmarkDurationSeconds: number;

	for (const treeSize of treeSizes) {
		maxBenchmarkDurationSeconds = treeSize === 100 ? 10 : 5;

		// Filter counts to ensure remove operation do not exceed treeSize
		const validRemoveCounts = operationCounts.filter((count) => count <= treeSize);

		// Insert-related tests that are not limited by treeSize
		for (const count of operationCounts) {
			describe(`Column Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a column in the middle for a given number of times.
				runBenchmark({
					title: `Insert a column in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { Column, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo insert the middle column ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						// assert.equal(stack.undoStackLength, count);
						const { undoStack } = tree;
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo insert the middle column ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
						}
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						// assert.equal(stack.undoStackLength, count);
						const { redoStack } = tree;
						for (let i = 0; i < count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Row Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a row in the middle for a given number of times.
				runBenchmark({
					title: `Insert a row in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo insert the middle row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { undoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert row in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo insert the middle row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Row, table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Column and Row Insertion`, () => {
				// Test the execute time of the SharedTree for inserting a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Insert a column and a row in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { Column, Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row and a column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo insert the middle column and row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { undoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < 2 * count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert row and a column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo insert the middle column and row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, Row, table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
						}
						for (let i = 0; i < 2 * count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < 2 * count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});
		}

		// Set/Remove-related tests that are limited by treeSize
		for (const count of validRemoveCounts) {
			describe(`Column Removal`, () => {
				// Test the execute time of the SharedTree for removing a column in the middle for a given number of times.
				runBenchmark({
					title: `Remove a column in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							table.removeColumn(`column-${i}`);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing remove a column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo remove the middle column ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							table.removeColumn(`column-${i}`);
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { undoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing a remove column in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo remove the middle column ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							table.removeColumn(`column-${i}`);
						}
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Row Removal`, () => {
				// Test the execute time of the SharedTree for removing a row in the middle for a given number of times.
				runBenchmark({
					title: `Remove a row in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							table.removeRow(`row-${i}`);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing remove a row in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo remove the middle row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							table.removeRow(`row-${i}`);
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { undoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing a remove row in the middle for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo remove the middle row ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							table.removeRow(`row-${i}`);
						}
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Column and Row Removal`, () => {
				// Test the execute time of the SharedTree for removing a row and a column in the middle for a given number of times.
				runBenchmark({
					title: `Remove a column and a row in the middle ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							table.removeColumn(`column-${i}`);
							table.removeRow(`row-${i}`);
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Insert a Column and a Row and Remove right away`, () => {
				// Test the execute time of the SharedTree for inserting a row and a column and removing them right away for a given number of times.
				runBenchmark({
					title: `Insert a column and a row and remove them right away ${count} times`,
					tableSize: treeSize,
					cellValue,
					operation: (tree: TableTreeDefinition) => {
						const { Column, Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `column-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							table.removeColumn(column);
							table.removeRow(row);
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing insert a row and a column and removing them right away for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo insert a column and a row and remove them right away ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, Row, table } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							table.removeColumn(column);
							table.removeRow(row);
						}
					},
					stackOperation: (stack) => {
						const { undoStack } = stack;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < 4 * count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing an insert row and a column and removing them right away for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo insert a column and a row and remove them right away ${count} times`,
					tableSize: treeSize,
					cellValue,
					setupOperation: (tree: TableTreeDefinition) => {
						const { Column, Row, table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							const column = new Column({ id: `column-${uuid()}` });
							const row = new Row({ id: `row-${uuid()}`, cells: {} });
							table.insertColumn({ index: Math.floor(table.columns.length / 2), column });
							table.insertRow({ index: Math.floor(table.rows.length / 2), row });
							table.removeColumn(column);
							table.removeRow(row);
						}
						for (let i = 0; i < 4 * count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < 4 * count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});

			describe(`Cell Value Setting`, () => {
				// Test the execute time of the SharedTree for setting a string in a cell for a given number of times.
				runBenchmark({
					title: `Set a cell value ${count} times`,
					tableSize: treeSize,
					cellValue: "abc",
					operation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							const rowIndex = Math.floor(table.rows.length / 2);
							const colIndex = Math.floor(table.columns.length / 2);
							table.setCell({
								key: {
									row: `row-${rowIndex}`,
									column: `column-${colIndex}`,
								},
								cell: { cellValue },
							});
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of undoing set a cell value for a given number of times.
				runUndoRedoBenchmark({
					title: `Undo set a cell value ${count} times`,
					tableSize: treeSize,
					cellValue: "abc",
					setupOperation: (tree: TableTreeDefinition) => {
						const { table } = tree;
						for (let i = 0; i < count; i++) {
							const rowIndex = Math.floor(table.rows.length / 2);
							const colIndex = Math.floor(table.columns.length / 2);
							table.setCell({
								key: {
									row: `row-${rowIndex}`,
									column: `column-${colIndex}`,
								},
								cell: { cellValue },
							});
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { undoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});

				// Test the execute time of the SharedTree for redoing a set cell value for a given number of times.
				runUndoRedoBenchmark({
					title: `Redo set a cell value ${count} times`,
					tableSize: treeSize,
					cellValue: "abc",
					setupOperation: (tree: TableTreeDefinition) => {
						const { table, undoStack } = tree;
						for (let i = 0; i < count; i++) {
							const rowIndex = Math.floor(table.rows.length / 2);
							const colIndex = Math.floor(table.columns.length / 2);
							table.setCell({
								key: {
									row: `row-${rowIndex}`,
									column: `column-${colIndex}`,
								},
								cell: { cellValue },
							});
						}
						for (let i = 0; i < count; i++) {
							undoStack.pop()?.revert();
						}
					},
					stackOperation: (tree: TableTreeDefinition) => {
						const { redoStack } = tree;
						// assert.equal(stack.undoStackLength, count);
						for (let i = 0; i < count; i++) {
							redoStack.pop()?.revert();
						}
					},
					maxBenchmarkDurationSeconds,
				});
			});
		}
	}
});
