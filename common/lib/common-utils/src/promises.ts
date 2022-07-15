/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A deferred creates a promise and the ability to resolve or reject it
 */
export class Deferred<T> {
    private readonly p: Promise<T>;
    private res: ((value: T | PromiseLike<T>) => void) | undefined;
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
    public get isCompleted(): boolean {
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
    public resolve(value: T | PromiseLike<T>): void {
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
    public reject(error: any): void {
        if (this.rej !== undefined) {
            this.completed = true;
            this.rej(error);
        }
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

    constructor(private readonly execute: () => Promise<T>) { }

    public async then<TResult1 = T, TResult2 = never>(
        // eslint-disable-next-line @rushstack/no-new-null
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
        // eslint-disable-next-line @rushstack/no-new-null
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined):
        Promise<TResult1 | TResult2> {
        // eslint-disable-next-line prefer-rest-params
        return this.getPromise().then<TResult1, TResult2>(...arguments);
    }

    public async catch<TResult = never>(
        // eslint-disable-next-line @rushstack/no-new-null
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined):
        Promise<T | TResult> {
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
