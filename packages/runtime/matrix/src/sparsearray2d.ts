/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { IMatrixReader } from "@tiny-calc/nano";

export interface IArray2D<T> extends IMatrixReader<T | undefined | null> {
    setCell(row: number, col: number, value: T | undefined): void;
}

// Build a lookup table that maps a uint8 to the corresponding uint16 where 0s
// are interleaved between the original bits. (e.g., 1111... -> 01010101...).
//
// (Lookup table ~17% faster than inlining the bit-twiddling on Node v12 x64)
// (Array<T> ~2% faster than typed array on Node v12 x64)
const x8ToInterlacedX16 =
    /* eslint-disable no-param-reassign */
    new Array(256).fill(0).map((value, i) => {
        i = (i | (i << 4)) & 0x0f0f; // .... 7654 .... 3210
        i = (i | (i << 2)) & 0x3333; // ..76 ..54 ..32 ..10
        i = (i | (i << 1)) & 0x5555; // .7.6 .5.4 .3.2 .1.0
        return i;
    });
/* eslint-enable no-param-reassign */

// Selects individual bytes from a given 32b integer.  The left shift are used to
// clear upper bits (faster than using masks on Node 10 x64).
const byte0 = (x32: number) => x32 >>> 24;
const byte1 = (x32: number) => (x32 << 8) >>> 24;
const byte2 = (x32: number) => (x32 << 16) >>> 24;
const byte3 = (x32: number) => (x32 << 24) >>> 24;

// Given a uint16 returns the corresponding uint32 integer where 0s are
// interleaved between the original bits. (e.g., 1111... -> 01010101...).
const interlaceBitsX16 = (x16: number) => (x8ToInterlacedX16[byte2(x16)] << 16) | x8ToInterlacedX16[byte3(x16)];

// Given a 2D uint16 coordinate returns the corresponding unt32 Morton coded
// coordinate.  (See https://en.wikipedia.org/wiki/Z-order_curve)
const r0c0ToMorton2x16 = (row: number, col: number) => (interlaceBitsX16(col) | (interlaceBitsX16(row) << 1)) >>> 0;

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
export class SparseArray2D<T> implements IArray2D<T> {
    constructor(private readonly root: UA<UA<UA<UA<UA<T>>>>> = [undefined]) { }

    public get numRows() { return 0xFFFFFFFF; }
    public get numCols() { return 0xFFFFFFFF; }

    read(row: number, col: number): T | undefined | null {
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

    setCell(row: number, col: number, value: T | undefined) {
        const keyHi = r0c0ToMorton2x16(row >>> 16, col >>> 16);
        const keyLo = r0c0ToMorton2x16(row, col);

        const level0 = this.getLevel(this.root, keyHi);
        const level1 = this.getLevel(level0, byte0(keyLo));
        const level2 = this.getLevel(level1, byte1(keyLo));
        const level3 = this.getLevel(level2, byte2(keyLo));
        level3[byte3(keyLo)] = value;
    }

    private getLevel<T>(parent: UA<UA<T>>, subKey: number) {
        const level = parent[subKey];
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
