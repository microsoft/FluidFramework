/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICache } from "@fluidframework/server-services-core";

export class TestCache implements ICache {
    private readonly map = new Map<string, string>();
    public async get(key: string): Promise<string> {
        return this.map.get(key) ?? "";
    }
    public async set(key: string, value: string): Promise<void> {
        this.map.set(key, value);
    }
}
