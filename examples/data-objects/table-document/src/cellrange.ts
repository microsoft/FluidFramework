/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/legacy";
import { ReferencePosition, SequenceInterval } from "@fluidframework/sequence/legacy";

const rangeExpr = /([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/;

// Parses an Excel-like column name to the corresponding 0-based index (e.g., 'A' -> 0)
export function colNameToIndex(colName: string) {
	return (
		[...colName]
			.map((letter) => letter.toUpperCase().charCodeAt(0) - 64) // 64 -> A=1, B=2, etc.
			.reduce((accumulator, value) => accumulator * 26 + value, 0) - 1
	); // 1-indexed -> 0-indexed
}

// Convert a 0-based column index into an Excel-like column name (e.g., 0 -> 'A')
/**
 * @internal
 */
export function colIndexToName(colIndex: number) {
	let name = "";

	let i = colIndex;
	do {
		const mod = i % 26;
		name = `${String.fromCharCode(65 + mod)}${name}`;
		i = Math.trunc(i / 26) - 1;
	} while (i >= 0);

	return name;
}

/**
 * @internal
 */
export function parseRange(range: string) {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const matches = rangeExpr.exec(range)!;
	const minCol = colNameToIndex(matches[1]);
	const minRow = parseInt(matches[2], 10) - 1; // 1-indexed -> 0-indexed
	const maxCol = colNameToIndex(matches[3]);
	const maxRow = parseInt(matches[4], 10) - 1; // 1-indexed -> 0-indexed
	return { minRow, minCol, maxRow, maxCol };
}

export class CellRange {
	constructor(
		private readonly interval: SequenceInterval,
		private readonly resolve: (localRef: ReferencePosition) => { row: number; col: number },
	) {
		// Ensure CellInterval was not created with a null/undefined interval.
		assert(!!interval, "CellInterval created with bad interval!");
	}

	public getRange() {
		const { row, col } = this.resolve(this.interval.start);
		const { row: maxRow, col: maxCol } = this.resolve(this.interval.end);

		const numRows = maxRow - row + 1;
		const numCols = maxCol - col + 1;

		return { row, col, numRows, numCols };
	}

	public forEachRowMajor(callback: (row: number, col: number) => boolean) {
		const r = this.getRange();
		for (let row = r.row, numRows = r.numRows; numRows > 0; row++, numRows--) {
			for (let col = r.col, numCols = r.numCols; numCols > 0; col++, numCols--) {
				if (!callback(row, col)) {
					return;
				}
			}
		}
	}

	public forEachColMajor(callback: (row: number, col: number) => boolean) {
		const r = this.getRange();
		for (let col = r.col, numCols = r.numCols; numCols > 0; col++, numCols--) {
			for (let row = r.row, numRows = r.numRows; numRows > 0; row++, numRows--) {
				if (!callback(row, col)) {
					return;
				}
			}
		}
	}
}
