/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "./test";

export class Array256x256<T> {
	private readonly cells: T[] = new Array(256 * 256).fill(0);

	public get rowCount() {
		return 256;
	}
	public get colCount() {
		return 256;
	}

	public getCell(row: number, col: number) {
		return this.cells[(row << 8) + col];
	}

	public setCell(row: number, col: number, value: T) {
		this.cells[(row << 8) + col] = value;
	}

	public get matrixProducer() {
		return undefined as any;
	}
}

pointwise(undefined, new Array256x256<number>());
