/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Three supported expiry policies:
 * - indefinite: entries don't expire and must be explicitly removed
 * - absolute: entries expire after the given duration in MS, even if accessed multiple times in the mean time
 * - sliding: entries expire after the given duration in MS of inactivity (i.e. get resets the clock)
 */
export type PromiseCacheExpiry = {
    policy: "indefinite"
} | {
    policy: "absolute" | "sliding",
    durationMs: number,
};

/**
 * @member expiry - Common expiration policy for all items added to this cache
 * @member removeOnError - If the stored Promise is rejected with a particular error,
 * should the given key be removed?
 */
export interface PromiseCacheOptions {
    expiry?: PromiseCacheExpiry,
    removeOnError?: (e: any) => boolean,
}

/**
 * Handles garbage collection of expiring cache entries.
 * Not exported.
 */
class GarbageCollector<TKey> {
    private readonly gcTimeouts = new Map<TKey, NodeJS.Timeout>();

    constructor(
        private readonly expiry: PromiseCacheExpiry,
        private readonly cleanup: (key: TKey) => void,
    ) {}

    /**
     * Schedule GC for the given key, as applicable
     */
    public schedule(key: TKey) {
        if (this.expiry.policy !== "indefinite") {
            this.gcTimeouts.set(
                key,
                setTimeout(
                    () => this.cleanup(key),
                    this.expiry.durationMs,
                ),
            );
        }
    }

    /**
     * Cancel any pending GC for the given key
     */
    public cancel(key: TKey) {
        const timeout = this.gcTimeouts.get(key);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.gcTimeouts.delete(key);
        }
    }

    /**
     * Update any pending GC for the given key, as applicable
     */
    public update(key: TKey) {
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
*/
export class PromiseCache<TKey, TResult> {
    private readonly cache = new Map<TKey, Promise<TResult>>();
    private readonly gc: GarbageCollector<TKey>;

    private readonly removeOnError: (e: any) => boolean;

    /**
     * Create the PromiseCache with the options provided
     * @param param0 - PromiseCacheOptions with the following default values:
     *   expiry = { policy: "indefinite" },
     *   removeOnError = () => true,
     */
    constructor({
        expiry = { policy: "indefinite" },
        removeOnError = () => true,
    }: PromiseCacheOptions = {}) {
        this.removeOnError = removeOnError;
        this.gc = new GarbageCollector<TKey>(expiry, (key) => this.remove(key));
    }

    /**
     * Get the Promise for the given key, or undefined if it's not found.
     * Extend expiry if applicable.
     */
    public async get(key: TKey) {
        if (this.cache.has(key)) {
            this.gc.update(key);
        }
        return this.cache.get(key);
    }

    /**
     * Remove the Promise for the given key,
     * returning true if it was found and removed
     */
    public remove(key: TKey) {
        this.gc.cancel(key);
        return this.cache.delete(key);
    }

    /**
     * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
     * Returns a Promise for the added or existing async work being done at that key.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     */
    public async addOrGet(
        key: TKey,
        asyncFn: () => Promise<TResult>,
    ): Promise<TResult> {
        // NOTE: Do not await the Promise returned by asyncFn!
        // Let the caller do so once we return
        let promise = this.cache.get(key);
        if (promise === undefined) {
            // Wrap in an async lambda in case asyncFn disabled @typescript-eslint/promise-function-async
            const safeAsyncFn = async () => asyncFn();

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
        else {
            this.gc.update(key);
        }

        return promise;
    }

    /**
     * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
     * Returns true if the add succeeded, or false if the cache already contained an entry at that key.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     */
    public add(
        key: TKey,
        asyncFn: () => Promise<TResult>,
    ): boolean {
        const alreadyPresent = this.cache.has(key);

        // This Promise has been stored in the cache and will be fetched and awaited later
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.addOrGet(key, asyncFn);

        return !alreadyPresent;
    }

    /**
     * Try to add the given value, without overwriting an existing cache entry at that key.
     * Returns a Promise for the added or existing async work being done at that key.
     * @param key - key name where to store the async work
     * @param value - value to store
     */
    public async addValueOrGet(
        key: TKey,
        value: TResult,
    ): Promise<TResult> {
        return this.addOrGet(key, async () => value);
    }

    /**
     * Try to add the given value, without overwriting an existing cache entry at that key.
     * Returns true if the add succeeded, or false if the cache already contained an entry at that key.
     * @param key - key name where to store the value
     * @param value - value to store
     */
    public addValue(
        key: TKey,
        value: TResult,
    ): boolean {
        return this.add(key, async () => value);
    }
}
