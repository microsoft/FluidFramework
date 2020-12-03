/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottler,
    IThrottlerHelper,
    IThrottlerResponse,
    ThrottlingError,
    ILogger,
} from "@fluidframework/server-services-core";

/**
 * A lenient implementation of IThrottlerHelper that prioritizes low latency over strict throttling.
 */
export class Throttler implements IThrottler {
    // TODO: Should these cache values expire? Use node-cache package perhaps?
    private readonly lastThrottleUpdateAtMap: { [key: string]: number } = {};
    private readonly requestDeltaMap: { [key: string]: number } = {};
    private readonly throttlerResponseCache: { [key: string]: IThrottlerResponse } = {};

    constructor(
        private readonly throttlerHelper: IThrottlerHelper,
        private readonly minThrottleIntervalInMs: number,
        private readonly logger?: ILogger,
    ) {
    }

    /**
     * Uses caching to bring added latency down to constant time (from cache connection time)
     * @throws {ThrottlingError} if throttled
     */
    public openRequest(id: string, weight: number = 1): void {
        this.updateRequestDelta(id, weight);

        void this.updateAndCacheThrottleStatus(id);

        // check cached throttle status, but allow requests through if status is not yet cached
        const cachedThrottlerResponse = this.throttlerResponseCache[id];
        if (!cachedThrottlerResponse) {
            void this.getAndCacheThrottleStatus(id);
        } else if (cachedThrottlerResponse.throttleStatus) {
            throw new ThrottlingError(
                cachedThrottlerResponse.throttleReason,
                Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000),
            );
        }
    }

    public closeRequest(id: string, weight: number = 1): void {
        this.updateRequestDelta(id, -weight);
    }

    private updateRequestDelta(id: string, value: number): void {
        if (this.requestDeltaMap[id] === undefined) {
            this.requestDeltaMap[id] = 0;
        }

        this.requestDeltaMap[id] += value;
    }

    private async updateAndCacheThrottleStatus(id: string): Promise<void> {
        const now = Date.now();
        if (this.lastThrottleUpdateAtMap[id] === undefined) {
            this.lastThrottleUpdateAtMap[id] = now;
        }
        if (now - this.lastThrottleUpdateAtMap[id] > this.minThrottleIntervalInMs) {
            const requestDelta = this.requestDeltaMap[id];
            this.lastThrottleUpdateAtMap[id] = now;
            this.requestDeltaMap[id] = 0;
            return this.throttlerHelper.updateRequestCount(id, requestDelta)
                .then((throttlerResponse) => {
                    this.throttlerResponseCache[id] = throttlerResponse;
                })
                .catch((err) => {
                    this.logger?.error(`Failed to update Throttler request count for ${id}: ${err}`);
                });
        }
    }

    private async getAndCacheThrottleStatus(id: string): Promise<void> {
        return this.throttlerHelper.getThrottleStatus(id)
            .then((throttlerResponse) => {
                if (!throttlerResponse) {
                    this.throttlerResponseCache[id] = {
                        throttleStatus: false,
                        throttleReason: undefined,
                        retryAfterInMs: 0,
                    };
                } else {
                    this.throttlerResponseCache[id] = throttlerResponse;
                }
            })
            .catch((err) => {
                this.logger?.error(`Failed to retrieve Throttler status for ${id}: ${err}`);
            });
    }
}
