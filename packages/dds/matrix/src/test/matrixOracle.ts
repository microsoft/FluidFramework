/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

import { TestConsumer } from "./testconsumer.js";

interface IConflict<T> {
	row: number;
	col: number;
	currentValue: T;
	conflictingValue: T;
	cellValue: T | undefined;
	lastEvent: "conflict" | "rowChange" | "colChange" | "cellChange";
}

export class SharedMatrixOracle {
	private readonly conflictListener: (
		row: number,
		col: number,
		currentValue: unknown,
		conflictingValue: unknown,
	) => void;
	private latestConflict = new Map<string, IConflict<unknown>>();
	private readonly matrixConsumer: IMatrixConsumer<string>;
	private readonly testConsumer: TestConsumer;

	constructor(private readonly shared: SharedMatrix) {
		this.matrixConsumer = {
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
								lastEvent: "cellChange",
							});
						}
					}
				}
			},
		};

		this.shared.openMatrix(this.matrixConsumer);
		this.testConsumer = new TestConsumer(this.shared);

		this.conflictListener = (row, col, currentValue, conflictingValue) => {
			this.onConflict(row, col, currentValue, conflictingValue);
		};

		if (this.shared.connected && this.shared.isSetCellConflictResolutionPolicyFWW()) {
			this.shared.on("conflict", this.conflictListener);
		}
	}

	private updateLatestHistory(
		type: "row" | "col",
		start: number,
		removed: number,
		inserted: number,
	): void {
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
				newMap.set(key, {
					...record,
					row,
					col,
					lastEvent: type === "row" ? "rowChange" : "colChange",
				});
			}
		}
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
				cellValue: this.testConsumer.getCell(row, col),
				lastEvent: "conflict",
			});
		}
	}

	public validate(): void {
		// validate matrix
		for (let r = 0; r < this.shared.rowCount; r++) {
			for (let c = 0; c < this.shared.colCount; c++) {
				const expected = this.testConsumer.getCell(r, c);
				const actual = this.shared.getCell(r, c);
				assert.deepStrictEqual(actual, expected, `Mismatch at [${r},${c}]`);
			}
		}

		// Validate conflict history
		for (const [, conflict] of this.latestConflict) {
			const { row, col, currentValue, conflictingValue, cellValue, lastEvent } = conflict;
			const inBounds = row < this.shared.rowCount && col < this.shared.colCount;
			const actual = inBounds ? this.shared.getCell(row, col) : undefined;

			switch (lastEvent) {
				case "conflict": {
					// Probably cell is not yet set
					if (actual === undefined) continue;
					// Winner must be present in the matrix
					if (inBounds) {
						assert.deepStrictEqual(
							actual,
							currentValue,
							`Conflict mismatch at [${row},${col}]:
					 expected winner=${currentValue},
					 actual=${actual},
					 loser=${conflictingValue} with cellValue=${cellValue}`,
						);
					}
					break;
				}
				case "rowChange":
				case "colChange": {
					// Just check entry is still valid
					assert.ok(
						inBounds,
						`Conflict entry at [${row},${col}] is out-of-bounds after ${lastEvent}`,
					);
					break;
				}
				case "cellChange": {
					// Ensure what we recorded matched the matrix state at the time
					if (inBounds) {
						assert.deepStrictEqual(
							actual,
							cellValue,
							`Cell change mismatch at [${row},${col}]:
					 expected=${cellValue},
					 actual=${actual}`,
						);
					}
					break;
				}
				default: {
					assert.fail(`Unexpected lastEvent type: ${lastEvent}`);
				}
			}
		}
	}

	public dispose(): void {
		this.shared.off("conflict", this.conflictListener);
		this.shared.matrixProducer.closeMatrix(this.matrixConsumer);
		this.shared.matrixProducer.closeMatrix(this.testConsumer);
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
