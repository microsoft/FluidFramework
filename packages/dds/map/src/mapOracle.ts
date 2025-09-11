/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedMap, IValueChanged } from "./interfaces.js";

/**
 * Simple oracle for ISharedMap that mirrors the map state.
 * @internal
 */
export class SharedMapOracle {
	private readonly oracle = new Map<string, unknown>();
	private readonly onValueChanged: (change: IValueChanged) => void;
	private readonly onClear: () => void;

	public constructor(private readonly fuzzMap: ISharedMap) {
		// Snapshot initial state
		for (const [k, v] of fuzzMap.entries()) {
			this.oracle.set(k, v);
		}

		this.onValueChanged = (change: IValueChanged) => {
			const { key } = change;

			// Update oracle to match DDS state
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const newVal = this.fuzzMap.get(key);

			if (newVal === undefined) {
				this.oracle.delete(key);
			} else {
				this.oracle.set(key, newVal);
			}
		};

		this.onClear = () => {
			this.oracle.clear();
		};

		// Subscribe
		this.fuzzMap.on("valueChanged", this.onValueChanged);
		this.fuzzMap.on("clear", this.onClear);
	}

	/**
	 * Validate that the oracle matches the DDS
	 * */
	public validate(): void {
		const actual = [...this.fuzzMap.entries()];
		const expected = [...this.oracle.entries()];

		if (actual.length !== expected.length) {
			throw new Error(
				`SharedMapOracle mismatch: expected ${expected.length}, actual ${actual.length}`,
			);
		}

		for (let i = 0; i < actual.length; i++) {
			const actualEntry = actual[i];
			const expectedEntry = expected[i];

			if (!actualEntry || !expectedEntry) {
				throw new Error(`Unexpected undefined entry at index ${i}`);
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const [actualKey, actualValue] = actualEntry;
			const [expectedKey, expectedValue] = expectedEntry;

			if (actualKey !== expectedKey || actualValue !== expectedValue) {
				throw new Error(
					`Mismatch at key="${actualKey}": actual=${actualValue}, expected=${expectedValue}`,
				);
			}
		}
	}

	public dispose(): void {
		this.fuzzMap.off("valueChanged", this.onValueChanged);
		this.fuzzMap.off("clear", this.onClear);
	}
}
