/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

export interface IConflict<T> {
	row: number;
	col: number;
	currentValue: T;
	conflictingValue: T;
	fwwPolicy: boolean;
}

/**
 * @internal
 */
export class SharedMatrixOracle<T> {
	private readonly conflictHistory = new Map<string, IConflict<T>[]>();

	constructor(private readonly shared: ISharedMatrix<T>) {
		this.shared.on("conflict", (row, col, currentValue, conflictingValue) => {
			const key = `${row},${col}`;
			const record: IConflict<T> = {
				row,
				col,
				currentValue: currentValue as T,
				conflictingValue: conflictingValue as T,
				fwwPolicy: this.shared.isSetCellConflictResolutionPolicyFWW(),
			};
			(this.conflictHistory.get(key) ?? this.conflictHistory.set(key, []).get(key))?.push(
				record,
			);

			// Immediate validation
			if (row < this.shared.rowCount && col < this.shared.colCount) {
				const actual = this.shared.getCell(row, col);
				assert.strictEqual(
					actual,
					currentValue,
					`Conflict mismatch at [${row},${col}]: expected="${currentValue}", actual="${actual}"`,
				);
			}
		});
	}
}

// export class SharedMatrixOracle<T> {
// 	private readonly conflictHistory = new Map<string, IConflict<T>[]>();

// 	constructor(private readonly shared: SharedMatrix<T>) {
// 		this.shared.on("conflict", (row, col, currentValue, conflictingValue) => {
// 			const key = `${row},${col}`;
// 			const conflict: IConflict<T> = {
// 				row,
// 				col,
// 				currentValue: currentValue as T,
// 				conflictingValue: conflictingValue as T,
// 				fwwPolicy: this.shared.isSetCellConflictResolutionPolicyFWW(),
// 			};

// 			const list = this.conflictHistory.get(key);
// 			if (list) {
// 				list.push(conflict);
// 			} else {
// 				this.conflictHistory.set(key, [conflict]);
// 			}
// 		});
// 	}

// 	public validate(): void {
// 		if (!this.shared.isSetCellConflictResolutionPolicyFWW()) return;

// 		for (const conflicts of this.conflictHistory.values()) {
// 			for (const { row, col, currentValue, fwwPolicy } of conflicts) {
// 				// Ignore if policy was off at the time
// 				if (!fwwPolicy) continue;

// 				// Ignore if row/col were removed
// 				if (row >= this.shared.rowCount || col >= this.shared.colCount) continue;

// 				const sharedVal = this.shared.getCell(row, col);
// 				assert.strictEqual(
// 					sharedVal,
// 					currentValue,
// 					`Conflict mismatch at [${row},${col}]: expected="${currentValue}", actual="${sharedVal}"`,
// 				);
// 			}
// 		}
// 	}
// }

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
