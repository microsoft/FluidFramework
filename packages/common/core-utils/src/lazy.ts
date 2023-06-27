/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper class for lazy initialized values. Ensures the value is only generated once, and remain immutable.
 */
export class Lazy<T> {
	private _value: T | undefined;
	private _evaluated: boolean = false;
	/**
	 * Instantiates an instance of Lazy<T>.
	 * @param valueGenerator - The function that will generate the value when value is accessed the first time.
	 */
	constructor(private readonly valueGenerator: () => T) {}

	/**
	 * Return true if the value as been generated, otherwise false.
	 */
	public get evaluated(): boolean {
		return this._evaluated;
	}

	/**
	 * Get the value. If this is the first call the value will be generated.
	 */
	public get value(): T {
		if (!this._evaluated) {
			this._evaluated = true;
			this._value = this.valueGenerator();
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._value!;
	}
}

/**
 * A lazy evaluated promise. The execute function is delayed until
 * the promise is used, e.g. await, then, catch ...
 * The execute function is only called once.
 * All calls are then proxied to the promise returned by the execute method.
 */
export class LazyPromise<T> implements Promise<T> {
	public get [Symbol.toStringTag](): string {
		return this.getPromise()[Symbol.toStringTag];
	}

	private result: Promise<T> | undefined;

	constructor(private readonly execute: () => Promise<T>) {}

	public async then<TResult1 = T, TResult2 = never>(
		// eslint-disable-next-line @rushstack/no-new-null
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		// eslint-disable-next-line prefer-rest-params
		return this.getPromise().then<TResult1, TResult2>(...arguments);
	}

	public async catch<TResult = never>(
		// eslint-disable-next-line @rushstack/no-new-null
		onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined,
	): Promise<T | TResult> {
		// eslint-disable-next-line prefer-rest-params
		return this.getPromise().catch<TResult>(...arguments);
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async finally(onfinally?: (() => void) | null | undefined): Promise<T> {
		// eslint-disable-next-line prefer-rest-params
		return this.getPromise().finally(...arguments);
	}

	private async getPromise(): Promise<T> {
		if (this.result === undefined) {
			this.result = this.execute();
		}
		return this.result;
	}
}
