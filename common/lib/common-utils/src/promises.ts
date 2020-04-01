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
 * Utility that makes sure that an expensive function fn
 * only has a single running instance at a time. For example,
 * this can ensure that only a single web request is pending at a
 * given time.
 */
export class SinglePromise<T> {
    private pResponse: Promise<T> | undefined;
    private active: boolean;
    constructor(private readonly fn: () => Promise<T>) {
        this.active = false;
    }

    public get response(): Promise<T> {
        // If we are actively running and we have a response return it
        if (this.active && this.pResponse) {
            return this.pResponse;
        }

        this.active = true;
        this.pResponse = this.fn()
            .then((response) => {
                this.active = false;
                return response;
            })
            .catch(async (e) => {
                this.active = false;
                return Promise.reject(e);
            });

        return this.pResponse;
    }
}

export const delay = async (ms?: number) => new Promise((res) => setTimeout(res, ms));

/**
 * A simple wrapper around Promise for when dealing with the
 * Promise object itself, to help avoid incorrect awaiting.
 */
export interface PromiseHandle<T> {
    promise: Promise<T>,
}

/**
 * A specialized cache for async work, allowing you to
 * safely cache the result of some async work
 * without fear of race conditions or running it twice.
 */
export class PromiseRegistry<T> {
    private readonly registry = new Map<string, PromiseHandle<T>>();

    /**
     * Get the Promise for the given key, or undefined if it's not found
     */
    public lookup = async (key: string) => this.registry.get(key)?.promise;

    /**
     * Remove the Promise for the given key,
     * returning true if it was found and removed
     */
    public unregister = (key: string) => this.registry.delete(key);

    /**
     * Register the given async work to the given key, or return an existing Promise at that key if it exists.
     * @param key - key name where to store the async work
     * @param asyncFn - the async work to do and store, if not already in progress under the given key
     * @param expiryTime - (optional) Automatically unregister the given key after some time
     * @param unregisterOnError - (optional) If the stored Promise is rejected, should the given key be unregistered?
     */
    public async register(
        key: string,
        asyncFn: () => Promise<T>,
        unregisterOnError?: (e: any) => boolean,
        expiryTime?: number,
        ): Promise<T> {
            return this.synchronousRegister(key, asyncFn, unregisterOnError, expiryTime).promise;
        }

    private synchronousRegister(key: string, asyncFn: () => Promise<T>, unregisterOnError?: (e: any) => boolean, expiryTime?: number): PromiseHandle<T> {
        // NOTE: Do not await asyncFn! Let the caller do so once register returns
        let handle = this.registry.get(key);
        if (handle === undefined) {
            // Start asyncFn and put the Promise in the cache
            const promiseToCache = asyncFn();
            handle = { promise: promiseToCache };
            this.registry.set(key, handle);

            // If asyncFn throws, remove the Promise from the cache
            promiseToCache.catch((error) => {
                if (unregisterOnError?.(error)) {
                    this.unregister(key);
                }
            });

            // Schedule garbage collection if required
            if (expiryTime) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.gc(key, expiryTime);
            }
        }
        return handle;
    }

    private async gc(key: string, expiryTime: number) {
        await delay(expiryTime);
        this.registry.delete(key);
    }
}
