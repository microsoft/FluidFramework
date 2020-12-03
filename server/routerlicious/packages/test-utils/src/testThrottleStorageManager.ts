/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequestMetrics, IThrottleStorageManager } from "@fluidframework/server-services-core";

// In-memory cache implementation of IThrottleManager for testing
export class TestThrottleStorageManager implements IThrottleStorageManager {
    private readonly cache: { [key: string]: IRequestMetrics } = {};

    async setRequestMetric(
        id: string,
        requestMetric: IRequestMetrics,
    ): Promise<void> {
        this.cache[id] = requestMetric;
    }

    async getRequestMetric(id: string): Promise<IRequestMetrics> {
        return this.cache[id];
    }
}
