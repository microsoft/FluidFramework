/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMatrix, SharedMatrix } from "../matrix.js";

/**
 * @internal
 */
export class SharedMatrixOracle {
	constructor(private readonly shared: ISharedMatrix) {
		this.shared.on("conflict", (row, col, currentValue, conflictingValue, target) => {
			if (row < this.shared.rowCount && col < this.shared.colCount) {
				assert(
					this.shared.isSetCellConflictResolutionPolicyFWW(),
					"Conflict should only fire in FWW mode",
				);

				const actual = this.shared.getCell(row, col);

				// The loser must be different
				assert.notDeepStrictEqual(currentValue, conflictingValue);

				// The cell contains the winner
				assert.deepStrictEqual(
					actual,
					currentValue,
					`FWW: Conflict mismatch at [${row},${col}]: expected winner=${currentValue}, actual=${actual} with conflicting value=${conflictingValue}`,
				);
			}
		});
	}
}

/**
 * @internal
 */
export interface IChannelWithOracles extends SharedMatrix {
	matrixOracle: SharedMatrixOracle;
}
