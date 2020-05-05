/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "./test";

export class Array256x256<T> {
    private readonly cells: T[] = new Array(256 * 256).fill(0);

    public get numRows() { return 256; }
    public get numCols() { return 256; }

    public read(row: number, col: number) {
        return this.cells[(row << 8) + col];
    }

    public setCell(row: number, col: number, value: T) {
        this.cells[(row << 8) + col] = value;
    }
}

pointwise(undefined, new Array256x256<number>());
