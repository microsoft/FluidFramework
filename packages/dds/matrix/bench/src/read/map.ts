/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "./test";

export class Map256x256<T> {
	private readonly cells = new Map<number, T>();

	public get rowCount() {
		return 256;
	}
	public get colCount() {
		return 256;
	}

	public getCell(row: number, col: number) {
		return this.cells.get((row << 8) + col);
	}

	public setCell(row: number, col: number, value: T) {
		this.cells.set((row << 8) + col, value);
	}

	public get matrixProducer() {
		return undefined as any;
	}
}

pointwise(undefined, new Map256x256<number>());
