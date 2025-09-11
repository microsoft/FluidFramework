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

	public constructor(private readonly fuzzMap: ISharedMap) {
		// Subscribe
		this.fuzzMap.on("valueChanged", this.onValueChanged);
		this.fuzzMap.on("clear", this.onClear);
	}

	private readonly onValueChanged = (change: IValueChanged): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;
		const oraclePrev = this.oracle.get(key);

		// Validate previousValue
		if (oraclePrev !== previousValue) {
			throw new Error(
				`SharedMapOracle previousValue mismatch: key="${key}", expected=${oraclePrev}, actual=${previousValue}`,
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newVal = this.fuzzMap.get(key);
		if (this.fuzzMap.has(key)) {
			this.oracle.set(key, newVal); // key exists, even if value is undefined
		} else {
			this.oracle.delete(key); // key was deleted
		}
	};

	private readonly onClear = (): void => {
		this.oracle.clear();
	};

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

		this.oracle.clear();
	}

	public dispose(): void {
		this.fuzzMap.off("valueChanged", this.onValueChanged);
		this.fuzzMap.off("clear", this.onClear);
	}
}
