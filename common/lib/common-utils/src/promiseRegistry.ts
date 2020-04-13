/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @member extendExpiryOnReregister - When a registered key is registered again,
 * should the pending expiration (if any) be extended?
 * @member unregisterOnError - If the stored Promise is rejected with a particular error,
 * should the given key be unregistered?
 */
export interface PromiseRegistryOptions {
    extendExpiryOnReregister?: boolean,
    unregisterOnError?: (e: any) => boolean,
}

/**
* A specialized cache for async work, allowing you to safely cache the promised result of some async work
* without fear of running it multiple times.
*/
export class PromiseRegistry<TKey, TResult> {
    private readonly cache = new Map<TKey, Promise<TResult>>();
    private readonly gcTimeouts = new Map<TKey, NodeJS.Timeout>();

    private readonly extendExpiryOnReregister: boolean;
    private readonly unregisterOnError: (e: any) => boolean;

    /**
     * Create the PromiseRegistry with the options provided
     * @param param0 - PromiseRegistryOptions with the following default values:
     *   extendExpiryOnReregister = false,
     *   unregisterOnError = () => true,
     */
    constructor({
        extendExpiryOnReregister = false,
        unregisterOnError = () => true,
    }: PromiseRegistryOptions = {}) {
        this.extendExpiryOnReregister = extendExpiryOnReregister;
        this.unregisterOnError = unregisterOnError;
    }

    /**
     * Get the Promise for the given key, or undefined if it's not found
     */
    public lookup = async (key: TKey) => this.cache.get(key);

    /**
     * Remove the Promise for the given key,
     * returning true if it was found and removed
     */
    public unregister(key: TKey){
        this.gcTimeouts.delete(key);
        return this.cache.delete(key);
    }

    /**
     * Register the given async work to the given key, or return an existing Promise at that key if it exists.
     * IMPORTANT: This will NOT overwrite an existing key - it's idempotent (within the expiryTime window),
     * so you must unregister a key if you want to register a different function/value.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     * @param expiryTime - (optional) Automatically unregister the given key after some time
     */
    public async register(
        key: TKey,
        asyncFn: () => Promise<TResult>,
        expiryTime?: number,
    ): Promise<TResult> {
        return this.synchronousRegister(key, asyncFn, expiryTime);
    }

    /**
     * Register the given value. Use lookup to get the Promise wrapping it in the registry
     * IMPORTANT: This will NOT overwrite an existing key - it's idempotent (within the expiryTime window),
     * so you must unregister a key if you want to register a different function/value.
     * @param key - key name where to store the value
     * @param value - value to store
     * @param expiryTime - (optional) Automatically unregister the given key after some time
     */
    public registerValue(
        key: TKey,
        value: TResult,
        expiryTime?: number,
    ) {
        // The Promise is stored in the cache and will be fetched and awaited later
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.synchronousRegister(key, async () => value, expiryTime);
    }

    // Leaving this non-async to discourage accidental awaiting before cache state is resolved.
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private synchronousRegister(
        key: TKey,
        asyncFn: () => Promise<TResult>,
        expiryTime?: number,
    ): Promise<TResult> {
        // NOTE: Do not await asyncFn() or handle.promise!
        // Let the caller do so once register returns
        let promise = this.cache.get(key);
        if (promise === undefined) {
            // Start asyncFn and put the Promise in the cache
            promise = asyncFn();
            this.cache.set(key, promise);

            // If asyncFn throws, possibly remove the Promise from the cache
            promise.catch((error) => {
                if (this.unregisterOnError(error)) {
                    this.unregister(key);
                }
            });
        }

        // Schedule or reschedule garbage collection if required
        this.handleGC(key, expiryTime);

        return promise;
    }

    private handleGC(key: TKey, expiryTime?: number) {
        // If we have a GC scheduled and we're not supposed to refresh, do nothing.
        if (this.gcTimeouts.has(key) && !this.extendExpiryOnReregister) {
            return;
        }

        // Cancel any existing GC Timeout
        if (this.gcTimeouts.has(key)) {
            clearTimeout(this.gcTimeouts.get(key)!);
        }
        if (expiryTime !== undefined) {
            // Schedule GC and save the Timeout ID in case we need to cancel it,
            // but only if expiryTime is provided (undefined means no expiration).
            this.gcTimeouts.set(
                key,
                setTimeout(
                    () => this.unregister(key),
                    expiryTime,
                )
            );
        }
    }
}
