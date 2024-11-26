/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper class for lazy initialized values.
 * Ensures the value is only generated once.
 */
export class Lazy<T> {
	/**
	 * Sentinel value that valueGenerator could not return (unlike undefined) for the unset case.
	 */
	private static readonly unset: unique symbol = Symbol("unset");

	/**
	 * The value, if computed, otherwise `unset`.
	 */
	private lazyValue: T | typeof Lazy.unset = Lazy.unset;

	/**
	 * Instantiates an instance of Lazy<T>.
	 * @param valueGenerator - The function that will generate the value when value is accessed the first time.
	 */
	public constructor(private readonly valueGenerator: () => T) {}

	/**
	 * Get the value. If this is the first call the value will be generated.
	 */
	public get value(): T {
		if (this.lazyValue === Lazy.unset) {
			this.lazyValue = this.valueGenerator();
		}
		return this.lazyValue;
	}
}
