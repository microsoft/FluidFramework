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
	private model: (T | undefined)[][] = [];
	private readonly onConflictHandler: (
		row: number,
		col: number,
		currentValue: T,
		conflictingValue: T,
		target: ISharedMatrix<T>,
	) => void;

	constructor(private readonly shared: ISharedMatrix<T>) {
		this.syncFromShared();
		this.onConflictHandler = (row, col, currentValue) => {
			this.ensureSize(row + 1, col + 1);
			this.model[row][col] = currentValue;
		};
		this.shared.on("conflict", (row, col, currentValue) => this.onConflictHandler);
	}

	private syncFromShared(): void {
		const rows = this.shared.rowCount;
		const cols = this.shared.colCount;

		this.model = [];
		for (let r = 0; r < rows; r++) {
			const row: (T | undefined)[] = [];
			for (let c = 0; c < cols; c++) {
				row.push(this.shared.getCell(r, c) as T);
			}
			this.model.push(row);
		}
	}

	private ensureSize(rows: number, cols: number): void {
		while (this.model.length < rows) {
			this.model.push(Array.from({ length: cols }, () => undefined));
		}
		for (const row of this.model) {
			while (row.length < cols) {
				row.push(undefined);
			}
		}
	}

	// Validate the oracle against the actual matrix
	public validate(): void {
		this.syncFromShared(); // always rebuild mirror
		const rows = this.model.length;
		// const cols = this.model[0]?.length ?? 0;

		if (rows !== this.shared.rowCount) {
			throw new Error(
				`SharedMatrixOracle mismatch: expected ${rows} rows, actual=${this.shared.rowCount}`,
			);
		}

		for (let r = 0; r < rows; r++) {
			if (this.model[r].length !== this.shared.colCount) {
				throw new Error(
					`SharedMatrixOracle mismatch at row ${r}: expected ${this.model[r].length} cols, actual=${this.shared.colCount}`,
				);
			}
			for (let c = 0; c < this.shared.colCount; c++) {
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
