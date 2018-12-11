import * as assert from "assert";

/**
 * A deferred creates a promise and the ability to resolve or reject it
 */
export class Deferred<T> {
    private readonly p: Promise<T>;
    private res: (value?: T | PromiseLike<T>) => void;
    private rej: (reason?: any) => void;

    constructor() {
        /* tslint:disable:promise-must-complete */
        this.p = new Promise<T>((resolve, reject) => {
            this.res = resolve;
            this.rej = reject;
        });
    }

    /**
     * Retrieves the underlying promise for the deferred
     */
    public get promise(): Promise<T> {
        return this.p;
    }

    /**
     * Resolves the promise
     */
    public resolve(value?: T | PromiseLike<T>) {
        this.res(value);
    }

    /**
     * Rejects the promsie
     */
    public reject(error: any) {
        this.rej(error);
    }
}

/**
 * Helper function that asserts that the given promise only resolves
 */
/* tslint:disable:promise-function-async */
export function assertNotRejected<T>(promise: Promise<T>): Promise<T> {
    // Assert that the given promise only resolves
    promise.catch((error) => {
        assert.ok(false);
    });

    return promise;
}
