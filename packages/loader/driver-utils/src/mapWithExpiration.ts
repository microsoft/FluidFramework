/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";

/**
 * An extension of Map that expires (deletes) entries after a period of inactivity.
 * The policy is based on the last time a key was written to.
 */
export class MapWithExpiration<TKey, TValue> extends Map<TKey, TValue> implements IDisposable {
    public disposed: boolean = false;
    private readonly expirationTimeouts = new Map<TKey, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly expiryMs: number,
    ) {
        super();
    }

    private scheduleExpiration(key: TKey) {
        this.expirationTimeouts.set(
            key,
            setTimeout(
                () => { this.delete(key); },
                this.expiryMs,
            ),
        );
    }

    private cancelExpiration(key: TKey) {
        const timeout = this.expirationTimeouts.get(key);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.expirationTimeouts.delete(key);
        }
    }

    get(key: TKey): TValue | undefined {
        return super.get(key);
    }

    set(key: TKey, value: TValue): this {
        // Sliding window expiration policy (on write)
        this.cancelExpiration(key);
        this.scheduleExpiration(key);

        return super.set(key, value);
    }

    delete(key: TKey): boolean {
        this.cancelExpiration(key);
        return super.delete(key);
    }

    dispose(_error?: Error): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        Array.from(this).forEach(([key]) => this.delete(key));
    }
}
