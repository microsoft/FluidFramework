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
 * Wraps an async function and the resulting Promise,
 * such that you can safely cache the result of some
 * async work without fear of race conditions or running it twice.
 */
export class CachablePromise<T> {
    private p: Promise<T> | undefined;
    constructor(
        private readonly asyncFn: () => Promise<T>,
    ) {}

    public get promise(): Promise<T> {
        if (this.p === undefined) {
            this.p = this.asyncFn();
        }
        return this.p;
    }
}

export interface PromiseHandle<T> {
    p: Promise<T>,
}

/**
 * A specialized cache for async work, allowing you to
 * safely cache the result of some async work
 * without fear of race conditions or running it twice.
 */export class PromiseRegistry<T> {
    protected readonly cache = new Map<string, PromiseHandle<T>>();

    public lookup = (key: string) => this.cache.get(key);

    public unregister = (key: string) => this.cache.delete(key);

    public register(key: string, asyncFn: () => Promise<T>, expiryTime?: number): PromiseHandle<T> {
        let handle = this.lookup(key);
        if (handle === undefined) {
            // Start asyncFn and put the Promise in the cache
            const promiseToCache = asyncFn();
            handle = { p: promiseToCache };
            this.cache.set(key, handle);

            // If asyncFn throws, remove the Promise from the cache
            promiseToCache.catch((error) => {
                this.unregister(key);
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
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
    }
}
