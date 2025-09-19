/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

interface IConflict<T> {
	row: number;
	col: number;
	currentValue: T;
	conflictingValue: T;
}

export class SharedMatrixOracle<T> {
	private model: (T | undefined)[][] = [];
	private readonly conflictHistory: IConflict<T>[] = [];

	constructor(private readonly shared: SharedMatrix<T>) {
		// Build initial snapshot of the shared matrix
		this.syncFromShared();

		this.shared.on("conflict", (row, col, currentValue, conflictingValue) => {
			// Track the conflict
			this.conflictHistory.push({
				row,
				col,
				currentValue: currentValue as T,
				conflictingValue: conflictingValue as T,
			});

			// Keep the model in sync for cells that triggered conflict
			this.ensureSize(row + 1, col + 1);
			this.model[row][col] = currentValue as T;
		});
	}

	// Build the current matrix snapshot from shared matrix
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

	public validate(): void {
		// Validate conflict history
		for (const conflict of this.conflictHistory) {
			const modelVal = this.model[conflict.row]?.[conflict.col];
			const sharedVal = this.shared.getCell(conflict.row, conflict.col);
			assert.deepStrictEqual(
				modelVal,
				conflict.currentValue,
				`Conflict mismatch at [${conflict.row},${conflict.col}] between: expected="${conflict.currentValue}", actual="${modelVal} and conflicting value=${conflict.conflictingValue}"`,
			);

			assert.deepStrictEqual(
				sharedVal,
				conflict.currentValue,
				`Conflict mismatch at [${conflict.row},${conflict.col}]: expected="${conflict.currentValue}", actual="${modelVal} and conflicting value=${conflict.conflictingValue}"`,
			);
		}
	}
}

/**
 * @internal
 */
export interface IChannelWithOracles extends SharedMatrix {
	matrixOracle: SharedMatrixOracle<unknown>;
}

/**
 * Type guard for SharedMatrix with an oracle
 * @internal
 */
export function hasSharedMatrixOracle(s: ISharedMatrix): s is IChannelWithOracles {
	return "matrixOracle" in s && s.matrixOracle instanceof SharedMatrixOracle;
}
