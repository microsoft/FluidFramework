/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

import { TestConsumer } from "./testconsumer.js";

export class SharedMatrixOracle {
	private readonly testConsumer: TestConsumer;
	private readonly conflictListener: (
		row: number,
		col: number,
		currentValue: unknown,
		conflictingValue: unknown,
	) => void;

	constructor(private readonly shared: SharedMatrix) {
		this.testConsumer = new TestConsumer(shared);

		this.conflictListener = (row, col, currentValue, conflictingValue) => {
			this.onConflict(row, col, currentValue, conflictingValue);
		};

		if (this.shared.connected && this.shared.isSetCellConflictResolutionPolicyFWW()) {
			this.shared.on("conflict", this.conflictListener);
		}
	}

	private onConflict(
		row: number,
		col: number,
		currentValue: unknown,
		conflictingValue: unknown,
	): void {
		assert(
			this.shared.isSetCellConflictResolutionPolicyFWW(),
			"Conflict should only fire in FWW mode",
		);

		// Only validate conflicts when the matrix is connected
		if (!this.shared.connected) {
			return;
		}

		if (row < this.shared.rowCount && col < this.shared.colCount) {
			const actual = this.testConsumer.getCell(row, col);

			// The loser must be different
			assert.notDeepStrictEqual(currentValue, conflictingValue);

			// The cell contains the winner
			assert.deepStrictEqual(
				actual,
				currentValue,
				`Conflict mismatch at [${row},${col}]: expected winner=${currentValue}, actual=${actual} with conflicting value=${conflictingValue}`,
			);
		}
	}

	public validate(): void {
		// Only validate conflicts when the matrix is connected
		if (!this.shared.connected) {
			return;
		}

		const rows = this.shared.rowCount;
		const cols = this.shared.colCount;

		// Validate the entire matrix
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const expected = this.testConsumer.getCell(r, c);
				const actual = this.shared.getCell(r, c);
				assert.strictEqual(
					actual,
					expected,
					`Mismatch at [${r},${c}]: expected="${expected}", actual="${actual}"`,
				);
			}
		}
	}

	public dispose(): void {
		this.shared.off("conflict", this.conflictListener);
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
