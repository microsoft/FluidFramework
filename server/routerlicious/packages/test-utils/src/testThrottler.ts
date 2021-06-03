/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottler, ThrottlingError } from "@fluidframework/server-services-core";

/**
 * Throttles if an id's count exceeds limit. Exposes tracked `throttleCounts` for easy assertions.
 */
export class TestThrottler implements IThrottler {
    public readonly throttleCounts: Map<string, number> = new Map<string, number>();

    constructor(private readonly limit?: number) {}

    public incrementCount(id: string, weight: number = 1): void {
        const currentCount = this.throttleCounts.get(id) || 0;
        this.checkThrottled(currentCount);

        const count = currentCount + weight;
        this.throttleCounts.set(id, count);

        this.checkThrottled(count);
    }

    public decrementCount(id: string, weight: number = 1): void {
        const count = (this.throttleCounts.get(id) || 0) - weight;
        this.throttleCounts.set(id, count);
    }

    private checkThrottled(count: number): void {
        if (this.limit && count > this.limit) {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw new ThrottlingError("throttled", count - this.limit);
        }
    }
}
