/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedMatrix } from "./matrix.js";
// import type { MatrixItem } from "./ops.js";

/**
 * @internal
 */
export class SharedMatrixOracle<T> {
	private readonly model: (T | undefined)[][];

	public constructor(private readonly shared: ISharedMatrix<T>) {
		// Initialize mirror from current matrix state
		const rows = this.shared.rowCount;
		const cols = this.shared.colCount;
		this.model = [];
		for (let r = 0; r < rows; r++) {
			const row: (T | undefined)[] = Array.from({ length: cols });
			for (let c = 0; c < cols; c++) {
				row[c] = this.shared.getCell(r, c) as unknown as T;
			}
			this.model.push(row);
		}

		// Listen for conflict events, type inferred from ISharedMatrixEvents
		this.shared.on("conflict", (row, col, currentValue, conflictingValue, target) => {
			this.ensureSize(row + 1, col + 1);
			this.model[row][col] = currentValue as T;
		});
	}

	private ensureSize(rows: number, cols: number): void {
		while (this.model.length < rows) {
			this.model.push(Array.from({ length: cols }));
		}
		for (const row of this.model) {
			while (row.length < cols) {
				row.push(undefined);
			}
		}
	}

	public validate(): void {
		const rows = this.shared.rowCount;
		const cols = this.shared.colCount;

		if (this.model.length !== rows) {
			throw new Error(
				`SharedMatrixOracle mismatch: expected ${this.model.length} rows, actual=${rows}`,
			);
		}

		for (let r = 0; r < rows; r++) {
			if (this.model[r].length !== cols) {
				throw new Error(
					`SharedMatrixOracle mismatch at row ${r}: expected ${this.model[r].length} cols, actual=${cols}`,
				);
			}
			for (let c = 0; c < cols; c++) {
				const expected = this.model[r][c];
				const actual = this.shared.getCell(r, c);
				if (expected !== actual) {
					throw new Error(
						`SharedMatrixOracle mismatch at [${r},${c}]: expected="${expected}", actual="${actual}"`,
					);
				}
			}
		}
	}

	public dispose(): void {
		// TODO: fix this
		// this.shared.off("conflict", this.onConflict);
	}

	// Keep a reference to the handler so we can remove it
	// private readonly onConflict = (row: number, col: number, currentValue: MatrixItem<T>): void => {
	// 	this.ensureSize(row + 1, col + 1);
	// 	this.model[row][col] = currentValue as T;
	// };
}

/**
 * @internal
 */
export interface IChannelWithOracles extends ISharedMatrix {
	matrixOracle: SharedMatrixOracle<unknown>;
}

/**
 * Type guard for SharedMatrix with an oracle
 * @internal
 */
export function hasSharedMatrixOracle(s: ISharedMatrix): s is IChannelWithOracles {
	return "matrixOracle" in s && s.matrixOracle instanceof SharedMatrixOracle;
}
