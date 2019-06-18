/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class Deferred<T> {
    private p: Promise<T>;
    private res: (value?: T | PromiseLike<T>) => void;
    private rej: (reason?: any) => void;

    constructor() {
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
