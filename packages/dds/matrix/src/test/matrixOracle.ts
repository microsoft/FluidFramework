/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

interface IConflict<T> {
	row: number;
	col: number;
	currentValue: T | undefined;
	conflictingValue: T | undefined;
}

export class SharedMatrixOracle<T> {
	private readonly model: Map<string, T | undefined> = new Map();
	private readonly conflictHistory = new Map<string, IConflict<T>>();

	constructor(private readonly shared: SharedMatrix<T>) {
		this.shared.on("conflict", (row, col, currentValue, conflictingValue) => {
			const key = `${row},${col}`;
			this.conflictHistory.set(key, {
				row,
				col,
				currentValue: currentValue as T,
				conflictingValue: conflictingValue as T,
			});
			this.rebuildModel();
		});
	}

	private rebuildModel(): void {
		this.model.clear();
		const rows = this.shared.rowCount;
		const cols = this.shared.colCount;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				this.model.set(`${r},${c}`, this.shared.getCell(r, c) as T);
			}
		}
	}

	public validate(): void {
		const sharedRows = this.shared.rowCount;
		const sharedCols = this.shared.colCount;

		for (const { row, col, currentValue, conflictingValue } of this.conflictHistory.values()) {
			// Skip conflicts outside current bounds
			if (row >= sharedRows || col >= sharedCols) continue;

			const modelVal = this.model.get(`${row},${col}`);

			assert.strictEqual(
				modelVal,
				currentValue,
				`Conflict mismatch at [${row},${col}] in model: expected="${currentValue}", actual="${modelVal}" (conflictingValue=${conflictingValue})`,
			);

			const sharedVal = this.shared.getCell(row, col);
			assert.strictEqual(
				sharedVal,
				currentValue,
				`Conflict mismatch at [${row},${col}] in shared matrix: expected="${currentValue}", actual="${sharedVal}" (conflictingValue=${conflictingValue})`,
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
