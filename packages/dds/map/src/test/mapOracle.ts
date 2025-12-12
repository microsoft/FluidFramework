/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedMap, IValueChanged } from "../interfaces.js";

/**
 * Simple oracle for ISharedMap that mirrors the map state.
 * @internal
 */
export class SharedMapOracle {
	private readonly oracle = new Map<string, unknown>();

	public constructor(private readonly fuzzMap: ISharedMap) {
		// Snapshot current state
		for (const [k, v] of fuzzMap.entries()) {
			this.oracle.set(k, v);
		}

		this.fuzzMap.on("valueChanged", this.onValueChanged);
		this.fuzzMap.on("clear", this.onClear);
	}

	private readonly onValueChanged = (change: IValueChanged, local: boolean): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;

		assert.strictEqual(
			previousValue,
			this.oracle.get(key),
			`Mismatch on previous value for key="${key}"`,
		);

		if (this.fuzzMap.has(key)) {
			this.oracle.set(key, this.fuzzMap.get(key));
		} else {
			this.oracle.delete(key);
		}
	};

	private readonly onClear = (local: boolean): void => {
		if (local) {
			this.oracle.clear();
		}
	};

	public validate(): void {
		const actual = Object.fromEntries(this.fuzzMap.entries());
		const expected = Object.fromEntries(this.oracle.entries());

		assert.deepStrictEqual(
			actual,
			expected,
			`SharedMapOracle mismatch: actual vs expected differs`,
		);
	}

	public dispose(): void {
		this.fuzzMap.off("valueChanged", this.onValueChanged);
		this.fuzzMap.off("clear", this.onClear);
	}
}
