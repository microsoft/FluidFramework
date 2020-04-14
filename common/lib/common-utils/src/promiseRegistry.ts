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
* A specialized cache for async work, allowing you to safely cache the promised result of some async work
* without fear of running it multiple times or losing track of errors.
*/
export class PromiseCache<TKey, TResult> {
    private readonly cache = new Map<TKey, Promise<TResult>>();
    private readonly gcTimeouts = new Map<TKey, NodeJS.Timeout>();

    private readonly expiry: PromiseCacheExpiry;
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
        this.expiry = expiry;
        this.removeOnError = removeOnError;
    }

    /**
     * Get the Promise for the given key, or undefined if it's not found.
     * Extend expiry if applicable.
     */
    public async get(key: TKey) {
        this.updateGC(key);
        return this.cache.get(key);
    }

    /**
     * Remove the Promise for the given key,
     * returning true if it was found and removed
     */
    public remove(key: TKey) {
        const deleted = this.cache.delete(key);
        this.updateGC(key);
        return deleted;
    }

    /**
     * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
     * Returns true if the add succeeded, or false if the cache already contained an entry at that key.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     * @throws - If the cache mechanism fails, will throw and nothing will have been added
     */
    public add(
        key: TKey,
        asyncFn: () => Promise<TResult>,
    ): boolean {
        const alreadyPresent = this.cache.has(key);

        // This Promise has been stored in the cache and will be fetched and awaited later
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.synchronousAddOrGet(key, asyncFn);

        return !alreadyPresent;
    }

    /**
     * Try to add the result of the given asyncFn, without overwriting an existing cache entry at that key.
     * Returns a Promise for the added or existing async work being done at that key.
     * If the cache mechanism fails, the returned Promise will be rejected and the cache will not contain the key.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     */
    public async addOrGet(
        key: TKey,
        asyncFn: () => Promise<TResult>,
    ): Promise<TResult> {
        return this.synchronousAddOrGet(key, asyncFn);
    }

    /**
     * Try to add the given value, without overwriting an existing cache entry at that key.
     * Returns true if the add succeeded, or false if the cache already contained an entry at that key.
     * @param key - key name where to store the value
     * @param value - value to store
     * @throws - If the cache mechanism fails, will throw and nothing will have been added
     */
    public addValue(
        key: TKey,
        value: TResult,
    ): boolean {
        return this.add(key, async () => value);
    }

    /**
     * Try to add the given value, without overwriting an existing cache entry at that key.
     * Returns a Promise for the added or existing async work being done at that key.
     * If the cache mechanism fails, the returned Promise will be rejected and the cache will not contain the key.
     * @param key - key name where to store the async work
     * @param value - value to store
     */
    public async addValueOrGet(
        key: TKey,
        value: TResult,
    ): Promise<TResult> {
        return this.synchronousAddOrGet(key, async () => value);
    }

    // We want to be able to throw synchronously to callers if something goes wrong in here
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private synchronousAddOrGet(
        key: TKey,
        asyncFn: () => Promise<TResult>,
    ): Promise<TResult> {
        // NOTE: Do not await the Promise returned by asyncFn!
        // Let the caller do so once we return
        try {
            let promise = this.cache.get(key);
            if (promise === undefined) {
                // Start asyncFn and put the Promise in the cache
                promise = asyncFn();
                this.cache.set(key, promise);

                // If asyncFn throws, we may remove the Promise from the cache
                promise.catch((error) => {
                    if (this.removeOnError(error)) {
                        this.remove(key);
                    }
                });
            }

            // Schedule or reschedule garbage collection if required
            this.updateGC(key);

            return promise;
        }
        catch(e) {
            // Something went horribly wrong. Remove this key and rethrow the error
            this.remove(key);
            throw e;  // This will throw to the caller since we're not async
        }
        }
    }

    private updateGC(key: TKey) {
        // If the key is not present in the cache, we shouldn't have a pending GC
        if (!this.cache.has(key)) {
            this.gcTimeouts.delete(key);
            return;
        }

        switch (this.expiry.policy) {
            case "indefinite": {
                return;
            }
            case "absolute": {
                // Only schedule GC if it's not already pending
                if (!this.gcTimeouts.has(key)) {
                    setTimeout(
                        () => this.remove(key),
                        this.expiry.durationMs,
                    );
                }
                return;
            }
            case "sliding": {
                // Cancel any existing GC Timeout
                const timeout = this.gcTimeouts.get(key);
                if (timeout !== undefined) {
                    clearTimeout(timeout);
                }

                // Schedule GC and save the Timeout ID so we're ready to cancel it to extend the expiration
                this.gcTimeouts.set(
                    key,
                    setTimeout(
                        () => this.remove(key),
                        this.expiry.durationMs,
                    ),
                );
                return;
            }
            default: {
                // Help tsc ensure the completeness of the switch statement
                return assert.fail(new Error(`Unexpected object: ${this.expiry}`));
            }
        }
    }
}
