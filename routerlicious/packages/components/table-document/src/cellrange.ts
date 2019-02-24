import { LocalReference } from "@prague/merge-tree";
import { SharedStringInterval } from "@prague/sequence";
import { colNameToIndex } from "./cell";

const rangeExpr = /([a-zA-Z]+)(\d+):([a-zA-Z]+)(\d+)/;

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
        private readonly resolve: (localRef: LocalReference) => { row: number, col: number }) {}

    public getPositions() {
        const { start, end } = this.interval;
        return { start: this.resolve(start), end: this.resolve(end) };
    }

    public forEachRowMajor(callback: (row: number, col: number) => boolean) {
        const {start, end} = this.getPositions();

        for (let row = start.row; row < end.row; row++) {
            for (let col = start.col; col < end.col; col++) {
                if (!callback(row, col)) {
                    return;
                }
            }
        }
    }

    public forEachColMajor(callback: (row: number, col: number) => boolean) {
        const {start, end} = this.getPositions();

        for (let col = start.col; col < end.col; col++) {
            for (let row = start.row; row < end.row; row++) {
                if (!callback(row, col)) {
                    return;
                }
            }
        }
    }
}
