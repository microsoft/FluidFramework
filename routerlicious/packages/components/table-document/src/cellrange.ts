import { LocalReference } from "@prague/merge-tree";
import { SharedStringInterval } from "@prague/sequence";

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
