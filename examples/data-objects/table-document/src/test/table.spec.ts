/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	// eslint-disable-next-line import/no-internal-modules -- #26906: `test-utils` internal used in examples (test)
} from "@fluidframework/test-utils/internal";

import { TableDocument } from "../document.js";
import { TableSlice } from "../slice.js";
import { TableDocumentItem } from "../table.js";

describeCompat("TableDocument", "LoaderCompat", (getTestObjectProvider) => {
	let tableDocument: TableDocument;

	function makeId(type: string) {
		const newId = Math.random().toString(36).substr(2);
		return newId;
	}

	let provider: ITestObjectProvider;
	beforeEach(async () => {
		provider = getTestObjectProvider();
		const container = await provider.createContainer(TableDocument.getFactory());
		tableDocument = await getContainerEntryPointBackCompat<TableDocument>(container);
	});

	const extract = (table: TableDocument) => {
		const rows: TableDocumentItem[][] = [];
		for (let r = 0; r < table.numRows; r++) {
			const cols: TableDocumentItem[] = [];
			for (let c = 0; c < table.numCols; c++) {
				cols.push(table.getCellValue(r, c));
			}
			rows.push(cols);
		}
		return rows;
	};

	const expect = async (expected: readonly (readonly any[])[]) => {
		assert.strictEqual(tableDocument.numRows, expected.length);
		assert.deepStrictEqual(extract(tableDocument), expected);

		// Paranoid check that awaiting incoming messages does not change test results.
		await provider.ensureSynchronized();
		assert.strictEqual(tableDocument.numRows, expected.length);
		assert.deepStrictEqual(extract(tableDocument), expected);
	};

	it("Initially empty", async () => {
		await expect([]);

		assert.throws(() => {
			tableDocument.getCellValue(0, 0);
		});
	});

	it("Insert row", async () => {
		tableDocument.insertRows(0, 1);
		await expect([[]]);
	});

	it("Insert col", async () => {
		tableDocument.insertRows(0, 1);
		tableDocument.insertCols(0, 1);
		await expect([[undefined]]);
	});

	describe("local get/set", () => {
		// GitHub Issue #1683 - Cannot roundtrip non-finite numbers.
		for (const value of ["", "string", 0]) {
			it(`roundtrip ${JSON.stringify(value)}`, async () => {
				tableDocument.insertRows(0, 1);
				tableDocument.insertCols(0, 1);
				tableDocument.setCellValue(0, 0, value);
				await expect([[value]]);
			});
		}

		// GitHub Issue #1683 - Cannot roundtrip non-finite numbers.
		// it(`roundtrip NaN`, () => {
		//     table.setCellText(0, 0, NaN);
		//     assert(isNaN(table.getCellValue(0, 0) as number));
		// });

		it(`all cells`, async () => {
			for (let row = 0; row < tableDocument.numRows; row++) {
				for (let col = 0; col < tableDocument.numCols; col++) {
					tableDocument.setCellValue(row, col, `${row},${col}`);
				}
			}

			for (let row = 0; row < tableDocument.numRows; row++) {
				for (let col = 0; col < tableDocument.numCols; col++) {
					assert.strictEqual(tableDocument.getCellValue(row, col), `${row},${col}`);
				}
			}
		});
	});

	describe("annotations", () => {
		it("row", () => {
			tableDocument.insertRows(0, 2);
			tableDocument.insertCols(0, 1);
			tableDocument.annotateRows(0, 1, { id: "row0" });
			assert.deepEqual({ ...tableDocument.getRowProperties(0) }, { id: "row0" });
			assert.strictEqual(tableDocument.getRowProperties(1), undefined);
		});

		it("col", () => {
			tableDocument.insertRows(0, 1);
			tableDocument.insertCols(0, 2);
			tableDocument.annotateCols(0, 1, { id: "col0" });
			assert.deepEqual({ ...tableDocument.getColProperties(0) }, { id: "col0" });
			assert.strictEqual(tableDocument.getColProperties(1), undefined);
		});
	});

	describe("TableSlice", () => {
		it("range follows edits", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);
			const min = { row: 1, col: 2 };
			const max = { row: 3, col: 4 };

			tableDocument.setCellValue(min.row, min.col, "start");
			tableDocument.setCellValue(max.row, max.col, "end");

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				min.row,
				min.col,
				max.row,
				max.col,
			);
			assert.strictEqual(slice.getCellValue(min.row, min.col), "start");
			assert.strictEqual(slice.getCellValue(max.row, max.col), "end");

			tableDocument.setCellValue(min.row, min.col, "min");
			tableDocument.setCellValue(max.row, max.col, "max");
			assert.strictEqual(slice.getCellValue(min.row, min.col), "min");
			assert.strictEqual(slice.getCellValue(max.row, max.col), "max");
		});

		it("asserts when outside of slice", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				0,
				0,
				2,
				2,
			);
			/* eslint-disable @typescript-eslint/no-unsafe-return */
			assert.throws(() => slice.getCellValue(-1, 0));
			assert.throws(() => slice.getCellValue(3, 0));
			assert.throws(() => slice.getCellValue(0, -1));
			assert.throws(() => slice.getCellValue(0, 3));
			/* eslint-enable @typescript-eslint/no-unsafe-return */
		});

		it("Annotations work when proxied through table slice", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				0,
				0,
				2,
				2,
			);
			slice.annotateRows(0, 1, { id: "row0" });
			assert.deepEqual({ ...slice.getRowProperties(0) }, { id: "row0" });
			assert.strictEqual(slice.getRowProperties(1), undefined);

			slice.annotateRows(2, 3, { id: "row1" });
			assert.deepEqual({ ...slice.getRowProperties(2) }, { id: "row1" });
		});

		it("Insert rows and columns work when proxied through table slice", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				0,
				0,
				2,
				2,
			);
			assert.equal(slice.numCols, 3);
			assert.equal(slice.numRows, 3);

			slice.insertCols(1, 2);
			assert.equal(slice.numCols, 5);
			slice.insertRows(1, 2);
			assert.equal(slice.numRows, 5);
		});
	});

	describe("CellRange", () => {
		it("forEachRowMajor visits all cells", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				1,
				1,
				2,
				2,
			);
			assert.equal(slice.numCols, 2);
			assert.equal(slice.numRows, 2);

			const visited: string[] = [];
			(slice as TableSlice).values.forEachRowMajor((row, col) => {
				visited.push(`${row},${col}`);
				return true;
			});

			assert.deepStrictEqual(visited, ["1,1", "1,2", "2,1", "2,2"]);
		});

		it("forEachColMajor visits all cells", async () => {
			tableDocument.insertRows(0, 5);
			tableDocument.insertCols(0, 7);

			const slice = await tableDocument.createSlice(
				makeId("Table-Slice"),
				"unnamed-slice",
				1,
				1,
				2,
				2,
			);
			assert.equal(slice.numCols, 2);
			assert.equal(slice.numRows, 2);

			const visited: string[] = [];
			(slice as TableSlice).values.forEachColMajor((row, col) => {
				visited.push(`${row},${col}`);
				return true;
			});

			assert.deepStrictEqual(visited, ["1,1", "2,1", "1,2", "2,2"]);
		});
	});
});
