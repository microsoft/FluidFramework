/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import { PromiseCache } from "@fluidframework/common-utils";
//* import { MapWithExpiration } from "@fluidframework/driver-base";
import { FiveDaysMs } from "@fluidframework/driver-definitions";

export interface ICache<T> extends IDisposable {
    get(key: string): Promise<T> | undefined;
    put(key: string, value: T): Promise<void>;
}

const fiveDaysMs: FiveDaysMs = 432000000;

export class InMemoryCache<T> extends PromiseCache<string, T> implements ICache<T> {
    public readonly disposed: boolean = false;
    constructor() {
        super({ expiry: { durationMs: fiveDaysMs, policy: "sliding" } });
    }

    public get(key: string): Promise<T> | undefined {
        return super.get(key);
    }

    public async put(key: string, value: T): Promise<void> {
        super.addValue(key, value);
    }

    public dispose() {
    }
}

export class NullCache<T> implements ICache<T> {
    public readonly disposed: boolean = false;
    public dispose() {}
    public get(key: string): Promise<T> | undefined {
        return undefined;
    }

    public async put(key: string, value: T): Promise<void> {
    }
}
