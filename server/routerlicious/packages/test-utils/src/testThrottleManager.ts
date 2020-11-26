/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequestMetrics, IThrottleManager, ThrottlerRequestType } from "@fluidframework/server-services-core";

// In-memory cache implementation of IThrottleManager for testing
export class TestThrottleManager implements IThrottleManager {
    private readonly cache: { [key: string]: IRequestMetrics } = {};

    async setRequestMetric(
        id: string,
        requestType: ThrottlerRequestType,
        requestMetric: IRequestMetrics,
    ): Promise<void> {
        this.cache[this.getKey(id, requestType)] = requestMetric;
    }

    async getRequestMetric(id: string, requestType: ThrottlerRequestType): Promise<IRequestMetrics> {
        return this.cache[this.getKey(id, requestType)];
    }

    private getKey(id: string, requestType: ThrottlerRequestType): string {
        return `${id}_${requestType}`;
    }
}
