/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "./test";

export class Map256x256<T> {
    private readonly cells = new Map<number, T>();

    public get numRows() { return 256; }
    public get numCols() { return 256; }

    public read(row: number, col: number) {
        return this.cells.get((row << 8) + col);
    }

    public setCell(row: number, col: number, value: T) {
        this.cells.set((row << 8) + col, value);
    }
}

pointwise(undefined, new Map256x256<number>());
