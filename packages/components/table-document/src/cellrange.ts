import { LocalReference } from "@prague/merge-tree";
import { SharedStringInterval } from "@prague/sequence";
import * as assert from "assert";

const rangeExpr = /([a-zA-Z]+)(\d+):([a-zA-Z]+)(\d+)/;

// Parses an Excel-like column name to the corresponding 0-based index (e.g., 'A' -> 0)
export function colNameToIndex(colName: string) {
    return [...colName]
        .map((letter) => letter.toUpperCase().charCodeAt(0) - 64)                   // 64 -> A=1, B=2, etc.
        .reduce((accumulator, value) => (accumulator * 26) + value, 0) - 1;         // 1-indexed -> 0-indexed
}

export function parseRange(range: string) {
    const matches = rangeExpr.exec(range)!;
    const minCol = colNameToIndex(matches[1]);
    const minRow = parseInt(matches[2], 10) - 1;    // 1-indexed -> 0-indexed
    const maxCol = colNameToIndex(matches[3]);
    const maxRow = parseInt(matches[4], 10) - 1;    // 1-indexed -> 0-indexed
    return { minRow, minCol, maxRow, maxCol };
}

export class CellRange {
    constructor(
        private readonly interval: SharedStringInterval,
        private readonly resolve: (localRef: LocalReference) => { row: number, col: number },
    ) {
        // Ensure CellInterval was not created with a null/undefined interval.
        assert(interval);
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
