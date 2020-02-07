import { pointwise } from './test';

const enum CONSTS {
    LOGW = 4,
    LOGH = 5,
    W = 1 << LOGW,
    H = 1 << LOGH,
    MW = W - 1,
    MH = H - 1,
    SIZEW = 1 << (4 * LOGW),
    SIZEH = 1 << (4 * LOGH),
}

type CellTile<T> = T[]

type SparseGrid<T> = CellTile<T>[][][];

function getCell<T>(r: number, c: number, grid: SparseGrid<T>): T | undefined {
    if (r < 0 || c < 0 || r >= CONSTS.SIZEH || c >= CONSTS.SIZEW) {
        return undefined;
    }
    const t2 = grid[(((c >> (3 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (3 * CONSTS.LOGH)) & CONSTS.MH)];
    if (t2) {
        const t3 = t2[(((c >> (2 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (2 * CONSTS.LOGH)) & CONSTS.MH)];
        if (t3) {
            const t4 = t3[(((c >> CONSTS.LOGW) & CONSTS.MW) << CONSTS.LOGH) | ((r >> CONSTS.LOGH) & CONSTS.MH)];
            if (t4) {
                return t4[((c & CONSTS.MW) << CONSTS.LOGH) | (r & CONSTS.MH)];
            }
        }
    }
    return undefined;
}

function setCell<T>(r: number, c: number, grid: SparseGrid<T>, value: T) {
    if (r < 0 || c < 0 || r >= CONSTS.SIZEH || c >= CONSTS.SIZEW) {
        return;
    }

    const i2 = (((c >> (3 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (3 * CONSTS.LOGH)) & CONSTS.MH);
    let t2 = grid[i2];
    if (t2 === undefined) {
        t2 = grid[i2] = [];
    }

    const i3 = (((c >> (2 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (2 * CONSTS.LOGH)) & CONSTS.MH);
    let t3 = t2[i3];
    if (t3 === undefined) {
        t3 = t2[i3] = [];
    }

    const i4 = (((c >> CONSTS.LOGW) & CONSTS.MW) << CONSTS.LOGH) | ((r >> CONSTS.LOGH) & CONSTS.MH);
    let t4 = t3[i4];
    if (t4 === undefined) {
        t4 = t3[i4] = [];
    }
    t4[((c & CONSTS.MW) << CONSTS.LOGH) | (r & CONSTS.MH)] = value;
}

function clearCell<T>(r: number, c: number, grid: SparseGrid<T>) {
    if (r < 0 || c < 0 || r >= CONSTS.SIZEH || c >= CONSTS.SIZEW) {
        return;
    }

    const i2 = (((c >> (3 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (3 * CONSTS.LOGH)) & CONSTS.MH);
    const t2 = grid[i2];
    if (t2 === undefined) {
        return;
    }

    const i3 = (((c >> (2 * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH) | ((r >> (2 * CONSTS.LOGH)) & CONSTS.MH);
    const t3 = t2[i3];
    if (t3 === undefined) {
        return;
    }

    const i4 = (((c >> CONSTS.LOGW) & CONSTS.MW) << CONSTS.LOGH) | ((r >> CONSTS.LOGH) & CONSTS.MH);
    const t4 = t3[i4];
    if (t4 === undefined) {
        return;
    }
    delete t4[((c & CONSTS.MW) << CONSTS.LOGH) | (r & CONSTS.MH)];
}

function forEachCell<T>(grid: SparseGrid<T>, cb: (r: number, c: number, value: T) => void): void {
    let i1 = 0;
    for (const t1 of grid) {
        if (t1 !== undefined) {
            let i2 = 0;
            const c1 = (i1 >> CONSTS.LOGH) << (3 * CONSTS.LOGW);
            const r1 = (i1 & CONSTS.MH) << (3 * CONSTS.LOGH);
            for (const t2 of t1) {
                if (t2 !== undefined) {
                    let i3 = 0;
                    const c2 = (i2 >> CONSTS.LOGH) << (2 * CONSTS.LOGW);
                    const r2 = (i2 & CONSTS.MH) << (2 * CONSTS.LOGH);
                    for (const t3 of t2) {
                        if (t3 !== undefined) {
                            let i4 = 0;
                            const c3 = (i3 >> CONSTS.LOGH) << CONSTS.LOGW;
                            const r3 = (i3 & CONSTS.MH) << CONSTS.LOGH;
                            for (const value of t3) {
                                if (value !== undefined) {
                                    cb(r1 | r2 | r3 | i4 & CONSTS.MH, c1 | c2 | c3 | i4 >> CONSTS.LOGH, value);
                                }
                                i4++;
                            }
                        }
                        i3++;
                    }
                }
                i2++;
            }
        }
        i1++;
    }
}

function forEachCellInColumn<T>(grid: SparseGrid<T>, column: number, cb: (r: number, c: number, value: T) => void): void {
    const colIdx1 = colIdx(column, 3);
    const colIdx2 = colIdx(column, 2);
    const colIdx3 = colIdx(column, 1);
    const colIdx4 = colIdx(column, 0);
    for (let r1 = 0; r1 < CONSTS.H; r1++) {
        const t1 = grid[colIdx1 | r1];
        if (t1 === undefined) { continue; }
        for (let r2 = 0; r2 < CONSTS.H; r2++) {
            const t2 = t1[colIdx2 | r2];
            if (t2 === undefined) { continue; }
            for (let r3 = 0; r3 < CONSTS.H; r3++) {
                const t3 = t2[colIdx3 | r3];
                if (t3 === undefined) { continue; }
                for (let r4 = 0; r4 < CONSTS.H; r4++) {
                    const cell = t3[colIdx4 | r4];
                    if (cell === undefined) { continue; }
                    cb(
                        (r1 & CONSTS.MH) << (3 * CONSTS.LOGH) |
                        (r2 & CONSTS.MH) << (2 * CONSTS.LOGH) |
                        (r3 & CONSTS.MH) << CONSTS.LOGH |
                        r4 & CONSTS.MH,
                        column, cell as any
                    );
                }
            }
        }
    }
}

function colIdx(col: number, level: 0 | 1 | 2 | 3): number {
    return ((col >> (level * CONSTS.LOGW)) & CONSTS.MW) << CONSTS.LOGH;
}

function colIdxUnshifted(col: number, level: 0 | 1 | 2 | 3): number {
    return ((col >> (level * CONSTS.LOGW)) & CONSTS.MW);
}

function forEachCellInColumns<T>(grid: SparseGrid<T>, columnStart: number, numCols: number, cb: (r: number, c: number, value: T) => void): void {
    const colEnd = columnStart + numCols - 1;
    for (let r1 = 0; r1 < CONSTS.H; r1++) {
        const cStart1 = colIdxUnshifted(columnStart, 3);
        const cEnd1 = colIdxUnshifted(colEnd, 3);
        for (let c1 = cStart1; c1 <= cEnd1; c1++) {
            const t1 = grid[(c1 << CONSTS.LOGH) | r1];
            if (t1 === undefined) { continue; }
            for (let r2 = 0; r2 < CONSTS.H; r2++) {
                const cStart2 = colIdxUnshifted(columnStart, 2);
                const cEnd2 = colIdxUnshifted(colEnd, 2);
                for (let c2 = cStart2; c2 <= cEnd2; c2++) {
                    const t2 = t1[(c2 << CONSTS.LOGH) | r2];
                    if (t2 === undefined) { continue; }
                    for (let r3 = 0; r3 < CONSTS.H; r3++) {
                        const cStart3 = colIdxUnshifted(columnStart, 1);
                        const cEnd3 = colIdxUnshifted(colEnd, 1);
                        for (let c3 = cStart3; c3 <= cEnd3; c3++) {
                            const t3 = t2[(c3 << CONSTS.LOGH) | r3];
                            if (t3 === undefined) { continue; }
                            for (let r4 = 0; r4 < CONSTS.H; r4++) {
                                const cStart4 = colIdxUnshifted(columnStart, 0);
                                const cEnd4 = colIdxUnshifted(colEnd, 0);
                                for (let c4 = cStart4; c4 <= cEnd4; c4++) {
                                    const cell = t3[(c4 << CONSTS.LOGH) | r4];
                                    if (cell === undefined) { continue; }
                                    cb(
                                        (r1 & CONSTS.MH) << (3 * CONSTS.LOGH) |
                                        (r2 & CONSTS.MH) << (2 * CONSTS.LOGH) |
                                        (r3 & CONSTS.MH) << CONSTS.LOGH |
                                        r4 & CONSTS.MH,
                                        (c1 << (3 * CONSTS.LOGW)) | (c2 << (2 * CONSTS.LOGW)) | (c3 << CONSTS.LOGW) | c4,
                                        cell
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Remove unused warnings
forEachCell;
clearCell;
forEachCellInColumn;
forEachCellInColumns;

function initGrid<T>(): SparseGrid<T> {
    return [];
}

export class TiledGrid<T> {
    private readonly cells: SparseGrid<T> = initGrid();

    public get numRows() { return CONSTS.SIZEH; }
    public get numCols() { return CONSTS.SIZEW; }

    public read(row: number, col: number) {
        return getCell(row, col, this.cells);
    }

    public setCell(row: number, col: number, value: T) {
        setCell(row, col, this.cells, value);
    }
}

pointwise("TiledGrid", new TiledGrid<number>());
