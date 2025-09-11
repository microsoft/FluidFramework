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
		// Subscribe
		this.fuzzMap.on("valueChanged", this.onValueChanged);
		this.fuzzMap.on("clear", this.onClear);
	}

	private readonly onValueChanged = (change: IValueChanged): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;

		assert.strictEqual(
			previousValue,
			this.oracle.get(key),
			`Mismatch on previous value for key="${key}"`,
		);

		if (this.fuzzMap.has(key)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const newVal = this.fuzzMap.get(key);
			this.oracle.set(key, newVal); // key exists, even if value is undefined
		} else {
			this.oracle.delete(key); // key was deleted
		}
	};

	/**
	 * Note: Simply clearing the oracle can leave it out of sync with the DDS, since other clients may re-populate entries immediately after a `clear`. To keep the oracle consistent, we rebuild it from the current state of the fuzzMap whenever a `clear` event is observed.
	 */
	private readonly onClear = (): void => {
		this.oracle.clear();
		for (const [k, v] of this.fuzzMap.entries()) {
			this.oracle.set(k, v);
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
