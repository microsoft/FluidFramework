/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlingMetrics, IThrottleStorageManager } from "@fluidframework/server-services-core";

/**
 * In-memory cache implementation of IThrottleManager for testing
 */
export class TestThrottleStorageManager implements IThrottleStorageManager {
    private readonly cache: { [key: string]: IThrottlingMetrics; } = {};

    async setThrottlingMetric(
        id: string,
        throttleMetric: IThrottlingMetrics,
    ): Promise<void> {
        this.cache[id] = throttleMetric;
    }

    async getThrottlingMetric(id: string): Promise<IThrottlingMetrics> {
        return this.cache[id];
    }
}
