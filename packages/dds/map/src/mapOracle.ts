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

		if (previousValue !== this.oracle.get(key)) {
			throw new Error("Mismatch on previous value");
		}

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
		const actual = new Map(this.fuzzMap.entries());

		if (actual.size !== this.oracle.size) {
			throw new Error(
				`SharedMapOracle mismatch: expected ${this.oracle.size}, actual ${actual.size}`,
			);
		}

		// Compare value by key
		for (const [key, actualValue] of actual.entries()) {
			const expectedValue = this.oracle.get(key);

			if (actualValue !== expectedValue) {
				throw new Error(
					`Mismatch at key="${key}": actual=${actualValue}, expected=${expectedValue}`,
				);
			}
		}
	}

	public dispose(): void {
		this.fuzzMap.off("valueChanged", this.onValueChanged);
		this.fuzzMap.off("clear", this.onClear);
	}
}
