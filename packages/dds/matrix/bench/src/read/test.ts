/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, getTestArgs } from "hotloop";
import { fill, IMatrix } from "../imports";

const { row, col, rowCount, colCount, fill: shouldFill } = getTestArgs();

export function pointwise<T>(name: string | undefined, matrix: IMatrix<T>) {
	if (shouldFill) {
		fill(matrix, row, col, rowCount, colCount);
	}

	benchmark(
		`SUM ${name !== undefined ? name : matrix.constructor.name} (${
			shouldFill ? "full" : "empty"
		}) Pointwise Read ${rowCount}x${colCount} @${row},${col}`,
		() => {
			let sum = 0;
			for (let r = row; r < rowCount; r++) {
				for (let c = col; c < colCount; c++) {
					sum += matrix.getCell(r, c) as any | 0;
				}
			}
			return sum;
		},
	);
}
