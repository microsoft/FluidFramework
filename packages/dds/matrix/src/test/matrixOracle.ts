/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

interface IConflict<T> {
	row: number;
	col: number;
	currentValue: T;
	conflictingValue: T;
	cellValue: T | undefined;
}

export class SharedMatrixOracle {
	private readonly conflictListener: (
		row: number,
		col: number,
		currentValue: unknown,
		conflictingValue: unknown,
	) => void;
	private latestConflict = new Map<string, IConflict<unknown>>();
	private readonly eventListeners: IMatrixConsumer<string>;

	constructor(private readonly shared: SharedMatrix) {
		this.eventListeners = {
			rowsChanged: (start, removed, inserted) => {
				this.updateLatestHistory("row", start, removed, inserted);
			},
			colsChanged: (start, removed, inserted) => {
				this.updateLatestHistory("col", start, removed, inserted);
			},
			cellsChanged: (
				rowStart: number,
				colStart: number,
				rowCount: number,
				colCount: number,
			) => {
				for (let r = rowStart; r < rowStart + rowCount; r++) {
					for (let c = colStart; c < colStart + colCount; c++) {
						const key = `${r},${c}`;
						const existing = this.latestConflict.get(key);

						const cellValue = this.shared.getCell(r, c);

						if (existing) {
							this.latestConflict.set(key, {
								...existing,
								cellValue, // capture current cell value
							});
						}
					}
				}
			},
		};

		this.shared.openMatrix(this.eventListeners);

		this.conflictListener = (row, col, currentValue, conflictingValue) => {
			this.onConflict(row, col, currentValue, conflictingValue);
		};

		if (this.shared.connected && this.shared.isSetCellConflictResolutionPolicyFWW()) {
			this.shared.on("conflict", this.conflictListener);
		}
	}

	private updateLatestHistory(type: "row" | "col", start, removed, inserted): void {
		const newMap = new Map<string, IConflict<unknown>>();

		for (const [key, record] of this.latestConflict) {
			let keep = true;
			let { row, col } = record;

			if (type === "row") {
				if (row >= start && row < start + removed) {
					keep = false; // row deleted, remove conflict
				} else if (row >= start + removed) {
					row += inserted - removed; // shift row
				}
			} else {
				if (col >= start && col < start + removed) {
					keep = false; // col deleted, remove conflict
				} else if (col >= start + removed) {
					col += inserted - removed; // shift col
				}
			}

			if (keep) {
				const key = `${row},${col}`;
				newMap.set(key, { ...record, row, col });
			}
		}
		this.latestConflict.clear();
		this.latestConflict = newMap;
	}

	private onConflict(
		row: number,
		col: number,
		currentValue: unknown,
		conflictingValue: unknown,
	): void {
		assert(
			this.shared.isSetCellConflictResolutionPolicyFWW(),
			"conflict event should only fire in FWW mode",
		);

		// Only validate conflicts when the matrix is connected
		if (this.shared.connected && row < this.shared.rowCount && col < this.shared.colCount) {
			this.latestConflict.set(`${row},${col}`, {
				row,
				col,
				currentValue,
				conflictingValue,
				cellValue: this.shared.getCell(row, col),
			});
		}
	}

	public validate(): void {
		// Validate conflict history
		for (const [, conflict] of this.latestConflict) {
			const { row, col, currentValue, conflictingValue, cellValue } = conflict;

			// Make sure the coordinates are still in-bounds
			if (row < this.shared.rowCount && col < this.shared.colCount) {
				const actual = this.shared.getCell(row, col);

				if (actual === undefined) {
					assert.deepStrictEqual(
						actual,
						cellValue,
						`cell value at [${row},${col}] is ${actual}, latest history: ${cellValue}`,
					);
					continue;
				}

				// Winner must be present in the matrix
				assert.deepStrictEqual(
					actual,
					currentValue,
					`Conflict history mismatch at [${row},${col}]:
				 expected winner=${currentValue},
				 actual=${actual},
				 loser=${conflictingValue} with cell value=${cellValue}`,
				);
			}
		}
	}

	public dispose(): void {
		this.shared.off("conflict", this.conflictListener);
		this.shared.matrixProducer.closeMatrix(this.eventListeners);
	}
}

/**
 * @internal
 */
export interface IChannelWithOracles extends SharedMatrix {
	matrixOracle: SharedMatrixOracle;
}

/**
 * Type guard for SharedMatrix with an oracle
 * @internal
 */
export function hasSharedMatrixOracle(s: ISharedMatrix): s is IChannelWithOracles {
	return "matrixOracle" in s && s.matrixOracle instanceof SharedMatrixOracle;
}
