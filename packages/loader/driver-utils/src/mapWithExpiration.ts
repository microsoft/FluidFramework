/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";

// export class MapWithExpiration2<TKey, TValue> implements Map<TKey, TValue>, IDisposable {
//     clear(): void {
//         throw new Error("Method not implemented.");
//     }
//     delete(key: TKey): boolean {
//         throw new Error("Method not implemented.");
//     }
//     forEach(callbackfn: (value: TValue, key: TKey, map: Map<TKey, TValue>) => void, thisArg?: any): void {
//         throw new Error("Method not implemented.");
//     }
//     get(key: TKey): TValue | undefined {
//         throw new Error("Method not implemented.");
//     }
//     has(key: TKey): boolean {
//         throw new Error("Method not implemented.");
//     }
//     set(key: TKey, value: TValue): this {
//         throw new Error("Method not implemented.");
//     }
//     size: number;
//     entries(): IterableIterator<[TKey, TValue]> {
//         throw new Error("Method not implemented.");
//     }
//     keys(): IterableIterator<TKey> {
//         throw new Error("Method not implemented.");
//     }
//     values(): IterableIterator<TValue> {
//         throw new Error("Method not implemented.");
//     }
//     [Symbol.iterator](): IterableIterator<[TKey, TValue]> {
//         throw new Error("Method not implemented.");
//     }
//     [Symbol.toStringTag]: string;

// }

//* Anything other basic props like ValueOf?

/**
 * An extension of Map that expires (deletes) entries after a period of inactivity.
 * The policy is based on the last time a key was written to.
 */
export class MapWithExpiration<TKey, TValue> extends Map<TKey, TValue> implements IDisposable {
    public disposed: boolean = false;

    //* Or: rather than extending Map just implement it and have a Map<TKey, [TValue, number]>
    /** Timestamps (as epoch ms numbers) of when each key was last refreshed */
    private readonly freshness = new Map<TKey, number>();

    constructor(
        private readonly expiryMs: number,
    ) {
        super();
    }

    private refresh(key: TKey): void {
        this.freshness.set(key, (new Date()).valueOf());
    }

    /**
     * Returns true if the key is present and expired, false if it's not expired, and undefined if it's not found
     * If cleanUp is passed as true, then delete any expired entry before returning.
     **/
    private checkExpiry(key: TKey, cleanUp: boolean = false): boolean | undefined {
        const freshness = this.freshness.get(key);
        if (freshness === undefined) {
            assert(!super.has(key), "freshness map out of sync");
            return undefined;
        }
        const expired = (new Date()).valueOf() - freshness >= this.expiryMs;
        if (expired && cleanUp) {
            this.delete(key);
        }
        return expired;
    }

    get size(): number {
        // forEach clears out any expired entries
        this.forEach(() => {});
        return super.size;
    }

    has(key: TKey): boolean {
        this.checkExpiry(key, true /* cleanUp */);
        return super.has(key);
    }

    get(key: TKey): TValue | undefined {
        this.checkExpiry(key, true /* cleanUp */);
        return super.get(key);
    }

    set(key: TKey, value: TValue): this {
        // Sliding window expiration policy (on write)
        this.refresh(key);
        return super.set(key, value);
    }

    delete(key: TKey): boolean {
        this.freshness.delete(key);
        return super.delete(key);
    }

    clear(): void {
        this.freshness.clear();
        super.clear();
    }

    forEach(callbackfn: (value: TValue, key: TKey, map: Map<TKey, TValue>) => void, thisArg?: any): void {
        const expiredKeys: TKey[] = [];
        super.forEach((v, k, m) => {
            if (this.checkExpiry(k)) {
                expiredKeys.push(k);
            } else {
                callbackfn(v, k, m);
            }
        }, thisArg);

        // Clean up keys we know are expired
        expiredKeys.forEach((key: TKey) => { this.delete(key); });
    }

    entries(): IterableIterator<[TKey, TValue]> {
        this.forEach(() => {});
        return super.entries();
    }
    keys(): IterableIterator<TKey> {
        this.forEach(() => {});
        return super.keys();
    }
    values(): IterableIterator<TValue> {
        this.forEach(() => {});
        return super.values();
    }
    [Symbol.iterator](): IterableIterator<[TKey, TValue]> {
        this.forEach(() => {});
        return super[Symbol.iterator]();
    }

    //* [Symbol.toStringTag]: string = "MapWithExpiration";

    valueOf() {
        this.forEach(() => {});
        return super.valueOf();
    }

    dispose(_error?: Error): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.clear();
    }
}
