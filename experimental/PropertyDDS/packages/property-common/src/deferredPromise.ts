/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Creates a Promise that can be fulfilled or rejected later in an arbitrary manner (rather than
 * through the constructor's executor).
 * For example, a deferred promise could be fulfilled after waiting for many asynchronous
 * tasks to terminate. This class becomes useful when combining classic async calls with promises.
 */
export class DeferredPromise<T> implements Promise<T> {
	private _resolveSelf;
	private _rejectSelf;
	private readonly promise: Promise<T>;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this._resolveSelf = resolve;
			this._rejectSelf = reject;
		});
	}
	[Symbol.toStringTag]: string;

	public async finally(onfinally?: () => void): Promise<T> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Fetches a node style callback that fulfills the promise when called.
	 * @returns A node style callback that fulfills the promise when called.
	 */
	getCb() {
		return (error, result) => {
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (error) {
				return this.reject(error);
			}
			return this.resolve(result);
		};
	}

	public async then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
	): Promise<TResult1 | TResult2> {
		return this.promise.then(onfulfilled, onrejected);
	}

	public async catch<TResult = never>(
		onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
	): Promise<T | TResult> {
		return this.promise.then(onrejected);
	}

	public resolve(val: T) {
		this._resolveSelf(val);
	}
	public reject(reason: any) {
		this._rejectSelf(reason);
	}
}
