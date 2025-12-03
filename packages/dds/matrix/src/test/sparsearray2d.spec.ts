/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SparseArray2D } from "../sparsearray2d.js";

import { check, extract, fill } from "./utils.js";

function expectEqual<T>(
	actual: SparseArray2D<T>,
	expected: SparseArray2D<T>,
	rowStart: number,
	colStart: number,
	rowCount: number,
	colCount: number,
): void {
	assert.deepEqual(
		extract(actual, rowStart, colStart, rowCount, colCount),
		extract(expected, rowStart, colStart, rowCount, colCount),
	);
}

describe("SparseArray2D", () => {
	it("read/write top-left 256x256", () => {
		const a = new SparseArray2D();
		fill(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
		check(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
	});

	it("read/write bottom-right 256x256", () => {
		const a = new SparseArray2D();
		fill(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
		check(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);

		fill(
			a,
			/* rowStart: */ 0xffffff00,
			/* colStart: */ 0xffffff00,
			/* rowCount: */ 256,
			/* colCount: */ 256,
		);
		check(
			a,
			/* rowStart: */ 0xffffff00,
			/* colStart: */ 0xffffff00,
			/* rowCount: */ 256,
			/* colCount: */ 256,
		);
	});

	describe("clear row/cols", () => {
		function makeCases(clearRows: boolean): IClearTestConfig[] {
			function makeCase(
				rowStart: number,
				colStart: number,
				rowCount: number,
				colCount: number,
				clearStart: number,
				clearCount: number,
			): IClearTestConfig {
				return clearRows
					? {
							rowStart,
							colStart,
							rowCount,
							colCount,
							rowClearStart: clearStart,
							rowClearCount: clearCount,
							colClearStart: 0,
							colClearCount: 0,
						}
					: {
							rowStart,
							colStart,
							rowCount,
							colCount,
							rowClearStart: 0,
							rowClearCount: 0,
							colClearStart: clearStart,
							colClearCount: clearCount,
						};
			}

			const cases = [
				makeCase(
					/* rowStart: */ 0,
					/* colStart: */ 0,
					/* rowCount: */ 1,
					/* colCount: */ 1,
					/* clearStart: */ 0,
					/* clearCount: */ 1,
				),

				// Straddle discontinuities in 256 x 256 block.
				makeCase(
					/* rowStart: */ 0,
					/* colStart: */ 0,
					/* rowCount: */ 256,
					/* colCount: */ 256,
					/* clearStart: */ 127,
					/* clearCount: */ 2,
				),
			];

			// Individually test clearing each row of top-left 16x16 tile.
			for (let i = 0; i < 16; i++) {
				cases.push(
					makeCase(
						/* rowStart: */ 0,
						/* colStart: */ 0,
						/* rowCount: */ 16,
						/* colCount: */ 16,
						/* clearStart: */ i,
						/* clearCount: */ 1,
					),
				);
			}

			// Individually test clearing each row of bottom-right 16x16 tile.
			{
				const start = 0xfffffff0;
				const count = 16;

				for (let i = start; i < start + 16; i++) {
					cases.push(
						makeCase(
							/* rowStart: */ start,
							/* colStart: */ start,
							/* rowCount: */ count,
							/* colCount: */ count,
							/* clearStart: */ i,
							/* clearCount: */ 1,
						),
					);
				}
			}

			return cases;
		}

		function testClear({
			rowStart,
			colStart,
			rowCount,
			colCount,
			rowClearStart,
			rowClearCount,
			colClearStart,
			colClearCount,
		}: IClearTestConfig): void {
			const fillRange = `(${rowStart},${colStart})-(${rowStart + rowCount},${
				rowStart + colCount
			})`;
			const rowClearRange =
				rowClearCount > 0
					? `clearRows [${rowClearStart}..${rowClearStart + rowClearCount}]`
					: "";
			const colClearRange =
				colClearCount > 0
					? `clearCols [${colClearStart}..${colClearStart + colClearCount}]`
					: "";

			it(`${rowClearRange}${colClearRange} (filled: ${fillRange})`, () => {
				const actual = new SparseArray2D();
				fill(actual, rowStart, colStart, rowCount, colCount);
				actual.clearRows(rowClearStart, rowClearCount);
				actual.clearCols(colClearStart, colClearCount);

				const expected = new SparseArray2D();
				fill(expected, rowStart, colStart, rowCount, colCount);

				for (let row = rowClearStart; row < rowClearStart + rowClearCount; row++) {
					for (let col = colStart; col < colStart + colCount; col++) {
						expected.setCell(row, col, undefined);
					}
				}

				for (let row = rowStart; row < rowStart + rowCount; row++) {
					for (let col = colClearStart; col < colClearStart + colClearCount; col++) {
						expected.setCell(row, col, undefined);
					}
				}

				expectEqual(actual, expected, rowStart, colStart, rowCount, colCount);
			});
		}

		describe("clear rows", () => {
			const cases = makeCases(/* clearRows: */ true);
			for (const testCase of cases) {
				testClear(testCase);
			}
		});

		describe("clear cols", () => {
			const cases = makeCases(/* clearRows: */ false);
			for (const testCase of cases) {
				testClear(testCase);
			}
		});
	});

	interface IClearTestConfig {
		readonly rowStart: number;
		readonly colStart: number;
		readonly rowCount: number;
		readonly colCount: number;
		readonly rowClearStart: number;
		readonly rowClearCount: number;
		readonly colClearStart: number;
		readonly colClearCount: number;
	}
});
