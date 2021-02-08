/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { IMatrixReader, IMatrixWriter } from "@tiny-calc/nano";

// Build a lookup table that maps a uint8 to the corresponding uint16 where 0s
// are interleaved between the original bits. (e.g., 1111... -> 01010101...).
//
// (Lookup table ~17% faster than inlining the bit-twiddling on Node v12 x64)
// (Array<T> ~2% faster than typed array on Node v12 x64)
const x8ToInterlacedX16 =
    new Array(256).fill(0).map((value, i) => {
        let j = i;
        j = (j | (j << 4)) & 0x0f0f; // .... 7654 .... 3210
        j = (j | (j << 2)) & 0x3333; // ..76 ..54 ..32 ..10
        j = (j | (j << 1)) & 0x5555; // .7.6 .5.4 .3.2 .1.0
        return j;
    });

// Selects individual bytes from a given 32b integer.  The left shift are used to
// clear upper bits (faster than using masks on Node 10 x64).
const byte0 = (x32: number) => x32 >>> 24;
const byte1 = (x32: number) => (x32 << 8) >>> 24;
const byte2 = (x32: number) => (x32 << 16) >>> 24;
const byte3 = (x32: number) => (x32 << 24) >>> 24;

// Given a uint16 returns the corresponding uint32 integer where 0s are
// interleaved between the original bits. (e.g., 1111... -> 01010101...).
const interlaceBitsX16 = (x16: number) => (x8ToInterlacedX16[byte2(x16)] << 16) | x8ToInterlacedX16[byte3(x16)];

const r0ToMorton16 = (row: number) => (interlaceBitsX16(row) << 1) >>> 0;
const c0ToMorton16 = (col: number) => interlaceBitsX16(col) >>> 0;

// Given a 2D uint16 coordinate returns the corresponding unt32 Morton coded
// coordinate.  (See https://en.wikipedia.org/wiki/Z-order_curve)
const r0c0ToMorton2x16 = (row: number, col: number) => (r0ToMorton16(row) | c0ToMorton16(col)) >>> 0;

type RecurArrayHelper<T> = RecurArray<T> | T;
type RecurArray<T> = RecurArrayHelper<T>[];

const nullToUndefined = <T>(array: RecurArray<T | null>): RecurArray<T | undefined> => array.map((value) => {
    // eslint-disable-next-line no-null/no-null
    return value === null
        ? undefined
        : Array.isArray(value)
            ? nullToUndefined(value)
            : value;
});

type UA<T> = (T | undefined)[];

/**
 * A sparse 4 billion x 4 billion array stored as 16x16 tiles.
 */
export class SparseArray2D<T> implements IMatrixReader<T | undefined | null>, IMatrixWriter<T | undefined> {
    constructor(private readonly root: UA<UA<UA<UA<UA<T>>>>> = [undefined]) { }

    public get rowCount() { return 0xFFFFFFFF; }
    public get colCount() { return 0xFFFFFFFF; }

    public getCell(row: number, col: number): T | undefined | null {
        const keyHi = r0c0ToMorton2x16(row >>> 16, col >>> 16);
        const level0 = this.root[keyHi];
        if (level0 !== undefined) {
            const keyLo = r0c0ToMorton2x16(row, col);
            const level1 = level0[byte0(keyLo)];
            if (level1 !== undefined) {
                const level2 = level1[byte1(keyLo)];
                if (level2 !== undefined) {
                    const level3 = level2[byte2(keyLo)];
                    if (level3 !== undefined) {
                        return level3[byte3(keyLo)];
                    }
                }
            }
        }

        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    public get matrixProducer() { return undefined as any; }

    public setCell(row: number, col: number, value: T | undefined) {
        const keyHi = r0c0ToMorton2x16(row >>> 16, col >>> 16);
        const keyLo = r0c0ToMorton2x16(row, col);

        const level0 = this.getLevel(this.root, keyHi);
        const level1 = this.getLevel(level0, byte0(keyLo));
        const level2 = this.getLevel(level1, byte1(keyLo));
        const level3 = this.getLevel(level2, byte2(keyLo));
        level3[byte3(keyLo)] = value;
    }

    /**
     * Invokes the given 'callback' for each key in a 16 x 16 tile at the indicated row.
     *
     * (Note that 'rowBits' is the appropriate byte from 'r0ToMorton16' for the current
     * level being traversed.)
     */
    private forEachKeyInRow(rowBits: number, callback: (key: number) => void) {
        for (let col = 0; col < 16; col++) {
            // Perf: Potentially faster to replace 'c0ToMorton16()' with a short look up table?
            callback((rowBits | c0ToMorton16(col)) >>> 0);
        }
    }

    /**
     * Invokes the given 'callback' for each key in a 16 x 16 tile at the indicated col.
     *
     * (Note that 'colBits' is the appropriate byte from 'c0ToMorton16' for the current
     * level being traversed.)
     */
    private forEachKeyInCol(col: number, callback: (key: number) => void) {
        for (let row = 0; row < 16; row++) {
            // Perf: Potentially faster to replace 'r0ToMorton16()' with a short look up table?
            callback((r0ToMorton16(row) | col) >>> 0);
        }
    }

    /**
     * Invokes the give 'callback' with the next 'level' array for each populated region
     * of the given row  in the 'currentLevel'.
     *
     * (Note that 'rowBits' is the appropriate byte from 'r0ToMorton16' for the current
     * level being traversed.)
     */
    private forEachInRow<V extends UA<any>, U extends UA<V>>(
        currentLevel: U,
        rowBits: number,
        callback: (level: V) => void,
    ) {
        this.forEachKeyInRow(rowBits, (key) => {
            const nextLevel = currentLevel[key];
            if (nextLevel !== undefined) {
                callback(nextLevel);
            }
        });
    }

    /**
     * Invokes the give 'callback' with the next 'level' array for each populated region
     * of the given col in the 'currentLevel'.
     *
     * (Note that 'colBits' is the appropriate byte from 'c0ToMorton16' for the current
     * level being traversed.)
     */
    private forEachInCol<V extends UA<any>, U extends UA<V>>(
        currentLevel: U,
        colBits: number,
        callback: (level: V) => void,
    ) {
        this.forEachKeyInCol(colBits, (key) => {
            const nextLevel = currentLevel[key];
            if (nextLevel !== undefined) {
                callback(nextLevel);
            }
        });
    }

    /** Clears the all cells contained within the specified span of rows. */
    public clearRows(rowStart: number, rowCount: number) {
        const rowEnd = rowStart + rowCount;
        for (let row = rowStart; row < rowEnd; row++) {
            const rowHi = r0ToMorton16(row >>> 16);

            // The top level of tree is a 64k x 64k tile.  We need to scan all 64k entries.
            for (let colHi = 0; colHi < 0x10000; colHi++) {
                const keyHi = (rowHi | c0ToMorton16(colHi)) >>> 0;
                const level0 = this.root[keyHi];
                if (level0 !== undefined) {
                    // The remainder of the tree is divided in 16 x 16 tiles.
                    const rowLo = r0ToMorton16(row);
                    this.forEachInRow(level0, byte0(rowLo), (level1) => {
                        this.forEachInRow(level1, byte1(rowLo), (level2) => {
                            this.forEachInRow(level2, byte2(rowLo), (level3) => {
                                this.forEachKeyInRow(byte3(rowLo), (key) => {
                                    level3[key] = undefined;
                                });
                            });
                        });
                    });
                }
            }
        }
    }

    /** Clears the all cells contained within the specifed span of cols. */
    public clearCols(colStart: number, colCount: number) {
        const colEnd = colStart + colCount;
        for (let col = colStart; col < colEnd; col++) {
            const colHi = c0ToMorton16(col >>> 16);

            // The top level of tree is a 64k x 64k tile.  We need to scan all 64k entries.
            for (let rowHi = 0; rowHi < 0x10000; rowHi++) {
                const keyHi = (colHi | r0ToMorton16(rowHi)) >>> 0;
                const level0 = this.root[keyHi];
                if (level0 !== undefined) {
                    // The remainder of the tree is divided in 16 x 16 tiles.
                    const colLo = c0ToMorton16(col);
                    this.forEachInCol(level0, byte0(colLo), (level1) => {
                        this.forEachInCol(level1, byte1(colLo), (level2) => {
                            this.forEachInCol(level2, byte2(colLo), (level3) => {
                                this.forEachKeyInCol(byte3(colLo), (key) => {
                                    level3[key] = undefined;
                                });
                            });
                        });
                    });
                }
            }
        }
    }

    private getLevel<T>(parent: UA<UA<T>>, subKey: number) {
        const level = parent[subKey];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return level === undefined
            ? (parent[subKey] = new Array(256).fill(undefined))
            : level;
    }

    public snapshot() {
        return this.root;
    }

    public static load<T>(data: RecurArray<T>) {
        return new SparseArray2D<T>(nullToUndefined<T>(data) as SparseArray2D<T>["root"]);
    }
}
