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

    constructor() {
        this.p = new Promise<T>((resolve, reject) => {
            this.res = resolve;
            this.rej = reject;
        });
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
