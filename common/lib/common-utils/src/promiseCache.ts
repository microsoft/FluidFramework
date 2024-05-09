/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Three supported expiry policies:
 * - indefinite: entries don't expire and must be explicitly removed
 * - absolute: entries expire after the given duration in MS, even if accessed multiple times in the mean time
 * - sliding: entries expire after the given duration in MS of inactivity (i.e. get resets the clock)
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export type PromiseCacheExpiry =
	| {
			policy: "indefinite";
	  }
	| {
			policy: "absolute" | "sliding";
			durationMs: number;
	  };

/**
 * Options for configuring the {@link PromiseCache}
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export interface PromiseCacheOptions {
	/**
	 * Common expiration policy for all items added to this cache
	 */
	expiry?: PromiseCacheExpiry;
	/**
	 * If the stored Promise is rejected with a particular error, should the given key be removed?
	 */
	removeOnError?: (e: any) => boolean;
}

/**
 * Handles garbage collection of expiring cache entries.
 * Not exported.
 *
 * @deprecated Only used internally by the {@link PromiseCache} class.
 */
class GarbageCollector<TKey> {
	private readonly gcTimeouts = new Map<TKey, ReturnType<typeof setTimeout>>();

	constructor(
		private readonly expiry: PromiseCacheExpiry,
		private readonly cleanup: (key: TKey) => void,
	) {}

	/**
	 * Schedule GC for the given key, as applicable
	 */
	public schedule(key: TKey): void {
		if (this.expiry.policy !== "indefinite") {
			this.gcTimeouts.set(
				key,
				setTimeout(() => {
					this.cleanup(key);
					this.cancel(key);
				}, this.expiry.durationMs),
			);
		}
	}

	/**
	 * Cancel any pending GC for the given key
	 */
	public cancel(key: TKey): void {
		const timeout = this.gcTimeouts.get(key);
		if (timeout !== undefined) {
			clearTimeout(timeout);
			this.gcTimeouts.delete(key);
		}
	}

	/**
	 * Update any pending GC for the given key, as applicable
	 */
	public update(key: TKey): void {
		// Cancel/reschedule new GC if the policy is sliding
		if (this.expiry.policy === "sliding") {
			this.cancel(key);
			this.schedule(key);
		}
	}
}

/**
 * A specialized cache for async work, allowing you to safely cache the promised result of some async work
 * without fear of running it multiple times or losing track of errors.
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export class PromiseCache<TKey, TResult> {
	private readonly cache = new Map<TKey, Promise<TResult>>();
	private readonly gc: GarbageCollector<TKey>;

	private readonly removeOnError: (error: any) => boolean;

	/**
	 * Create the PromiseCache with the given options, with the following defaults:
	 *
	 * expiry: indefinite, removeOnError: true for all errors
	 */
	constructor({
		expiry = { policy: "indefinite" },
		removeOnError = (): boolean => true,
	}: PromiseCacheOptions = {}) {
		this.removeOnError = removeOnError;
		this.gc = new GarbageCollector<TKey>(expiry, (key) => this.remove(key));
	}

	/**
	 * Check if there's anything cached at the given key
	 */
	public has(key: TKey): boolean {
		return this.cache.has(key);
	}

	/**
	 * Get the Promise for the given key, or undefined if it's not found.
	 * Extend expiry if applicable.
	 */
	public get(key: TKey): Promise<TResult> | undefined {
		if (this.has(key)) {
			this.gc.update(key);
		}
		return this.cache.get(key);
	}

	/**
	 * Remove the Promise for the given key, returning true if it was found and removed
	 */
	public remove(key: TKey): boolean {
		this.gc.cancel(key);
		return this.cache.delete(key);
	}

	/**
	 * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
	 * Returns a Promise for the added or existing async work being done at that key.
	 * @param key - key name where to store the async work
	 * @param asyncFn - the async work to do and store, if not already in progress under the given key
	 */
	public async addOrGet(key: TKey, asyncFn: () => Promise<TResult>): Promise<TResult> {
		// NOTE: Do not await the Promise returned by asyncFn!
		// Let the caller do so once we return or after a subsequent call to get
		let promise = this.get(key);
		if (promise === undefined) {
			// Wrap in an async lambda in case asyncFn disabled @typescript-eslint/promise-function-async
			const safeAsyncFn = async (): Promise<TResult> => asyncFn();

			// Start the async work and put the Promise in the cache
			promise = safeAsyncFn();
			this.cache.set(key, promise);

			// If asyncFn throws, we may remove the Promise from the cache
			promise.catch((error) => {
				if (this.removeOnError(error)) {
					this.remove(key);
				}
			});

			this.gc.schedule(key);
		}

		return promise;
	}

	/**
	 * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
	 * Returns false if the cache already contained an entry at that key, and true otherwise.
	 * @param key - key name where to store the async work
	 * @param asyncFn - the async work to do and store, if not already in progress under the given key
	 */
	public add(key: TKey, asyncFn: () => Promise<TResult>): boolean {
		const alreadyPresent = this.has(key);

		// We are blindly adding the Promise to the cache here, which introduces a Promise in this scope.
		// Swallow Promise rejections here, since whoever gets this out of the cache to use it will await/catch.
		this.addOrGet(key, asyncFn).catch(() => {});

		return !alreadyPresent;
	}

	/**
	 * Try to add the given value, without overwriting an existing cache entry at that key.
	 * Returns a Promise for the added or existing async work being done at that key.
	 * @param key - key name where to store the async work
	 * @param value - value to store
	 */
	public async addValueOrGet(key: TKey, value: TResult): Promise<TResult> {
		return this.addOrGet(key, async () => value);
	}

	/**
	 * Try to add the given value, without overwriting an existing cache entry at that key.
	 * Returns false if the cache already contained an entry at that key, and true otherwise.
	 * @param key - key name where to store the value
	 * @param value - value to store
	 */
	public addValue(key: TKey, value: TResult): boolean {
		return this.add(key, async () => value);
	}
}
