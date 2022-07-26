/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Comparer<T> {
    compare(a: T, b: T): number;
    min: T;
}

export class Heap<T> {
    private L: T[];
    public count() {
        return this.L.length - 1;
    }
    constructor(a: T[], public comp: Comparer<T>) {
        this.L = [comp.min];
        for (let i = 0, len = a.length; i < len; i++) {
            this.add(a[i]);
        }
    }
    public peek() {
        return this.L[1];
    }

    public get() {
        const x = this.L[1];
        this.L[1] = this.L[this.count()];
        this.L.pop();
        this.fixDown(1);
        return x;
    }

    public add(x: T) {
        this.L.push(x);
        this.fixup(this.count());
    }

    /* eslint-disable no-bitwise */
    private fixup(k: number) {
        let _k = k;
        while (_k > 1 && (this.comp.compare(this.L[_k >> 1], this.L[_k]) > 0)) {
            const tmp = this.L[_k >> 1];
            this.L[_k >> 1] = this.L[_k];
            this.L[_k] = tmp;
            _k = _k >> 1;
        }
    }

    private fixDown(k: number) {
        let _k = k;
        while ((_k << 1) <= (this.count())) {
            let j = _k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j], this.L[j + 1]) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[_k], this.L[j]) <= 0) {
                break;
            }
            const tmp = this.L[_k];
            this.L[_k] = this.L[j];
            this.L[j] = tmp;
            _k = j;
        }
    }
    /* eslint-enable no-bitwise */
}
