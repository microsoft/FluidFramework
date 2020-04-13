/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

/**
 * A deferred creates a promise and the ability to resolve or reject it
 */
export class Deferred<T> {
    private readonly p: Promise<T>;
    private res: ((value?: T | PromiseLike<T>) => void) | undefined;
    private rej: ((reason?: any) => void) | undefined;
    private completed: boolean = false;

    constructor() {
        this.p = new Promise<T>((resolve, reject) => {
            this.res = resolve;
            this.rej = reject;
        });
    }
    /**
     * Returns whether the underlying promise has been completed
     */
    public get isCompleted() {
        return this.completed;
    }

    /**
     * Retrieves the underlying promise for the deferred
     *
     * @returns the underlying promise
     */
    public get promise(): Promise<T> {
        return this.p;
    }

    /**
     * Resolves the promise
     *
     * @param value - the value to resolve the promise with
     */
    public resolve(value?: T | PromiseLike<T>) {
        if (this.res !== undefined) {
            this.completed = true;
            this.res(value);
        }
    }

    /**
     * Rejects the promise
     *
     * @param value - the value to reject the promise with
     */
    public reject(error: any) {
        if (this.rej !== undefined) {
            this.completed = true;
            this.rej(error);
        }
    }
}

/**
 * Helper function that asserts that the given promise only resolves
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function assertNotRejected<T>(promise: Promise<T>): Promise<T> {
    // Assert that the given promise only resolves
    promise.catch((error) => {
        assert.ok(false);
    });

    return promise;
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

    constructor(private readonly execute: () => Promise<T>) { }

    public async then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined):
        Promise<TResult1 | TResult2> {
        return this.getPromise().then<TResult1, TResult2>(...arguments);
    }

    public async catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined):
        Promise<T | TResult> {
        return this.getPromise().catch<TResult>(...arguments);
    }

    public async finally(onfinally?: (() => void) | null | undefined): Promise<T> {
        return this.getPromise().finally(...arguments);
    }

    private async getPromise(): Promise<T> {
        if (this.result === undefined) {
            this.result = this.execute();
        }
        return this.result;
    }
}

/**
 * A Promise wrapper for window.setTimeout
 * @param ms - (optional) How many ms to wait before continuing
 */
export const delay = async (ms?: number) => new Promise((res) => setTimeout(res, ms));

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

    private handleGC(key: TKey, expiryTime: number) {
        // If we have a GC scheduled and we're not supposed to refresh, do nothing.
        if (this.gcTimeouts.has(key) && !this.extendExpiryOnReregister) {
            return;
        }

        // Cancel any existing GC Timeout
        clearTimeout(this.gcTimeouts.get(key));

        if (expiryTime) {
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
