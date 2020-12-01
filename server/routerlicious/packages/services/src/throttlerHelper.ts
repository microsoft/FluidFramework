/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottler,
    IThrottlerHelper,
    IThrottlerResponse,
    ThrottlerRequestType,
    ThrottlingError,
    ILogger,
} from "@fluidframework/server-services-core";

/**
 * A lenient implementation of IThrottlerHelper that prioritizes low latency over strict throttling.
 */
export class ThrottlerHelper implements IThrottlerHelper {
    // TODO: Should these cache values expire? Use node-cache package perhaps?
    private readonly lastThrottleUpdateAtMap: { [key: string]: number } = {};
    private readonly requestDeltaMap: { [key: string]: number } = {};
    private readonly throttlerResponseCache: { [key: string]: IThrottlerResponse } = {};

    constructor(
        private readonly throttler: IThrottler,
        private readonly minThrottleIntervalInMs: number,
        private readonly logger?: ILogger,
    ) {
    }

    /**
     * Uses caching to bring added latency down to constant time (from cache connection time)
     * @throws {ThrottlingError} if throttled
     */
    public openRequest(id: string, requestType: ThrottlerRequestType): void {
        this.updateRequestDelta(id, requestType, 1);

        void this.updateAndCacheThrottleStatus(id, requestType);

        // check cached throttle status, but allow requests through if status is not yet cached
        const key = this.getKey(id, requestType);
        const cachedThrottlerResponse = this.throttlerResponseCache[key];
        if (!cachedThrottlerResponse) {
            void this.getAndCacheThrottleStatus(id, requestType);
        } else if (cachedThrottlerResponse.throttleStatus) {
            throw new ThrottlingError(
                cachedThrottlerResponse.throttleReason,
                Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000),
            );
        }
    }

    public closeRequest(id: string, requestType: ThrottlerRequestType): void {
        this.updateRequestDelta(id, requestType, -1);
    }

    private getKey(id: string, requestType: ThrottlerRequestType): string {
        return `${id}_${requestType}`;
    }

    private updateRequestDelta(id: string, requestType: ThrottlerRequestType, value: number): void {
        const key = this.getKey(id, requestType);
        if (this.requestDeltaMap[key] === undefined) {
            this.requestDeltaMap[key] = 0;
        }

        this.requestDeltaMap[key] += value;
    }

    private async updateAndCacheThrottleStatus(id: string, requestType: ThrottlerRequestType): Promise<void> {
        const key = this.getKey(id, requestType);

        const now = Date.now();
        if (this.lastThrottleUpdateAtMap[key] === undefined) {
            this.lastThrottleUpdateAtMap[key] = now;
        }
        if (now - this.lastThrottleUpdateAtMap[key] > this.minThrottleIntervalInMs) {
            const requestDelta = this.requestDeltaMap[key];
            this.lastThrottleUpdateAtMap[key] = now;
            this.requestDeltaMap[key] = 0;
            return this.throttler.updateRequestCount(id, requestType, requestDelta)
                .then((throttlerResponse) => {
                    this.throttlerResponseCache[key] = throttlerResponse;
                })
                .catch((err) => {
                    this.logger?.error(`Failed to update Throttler request count for ${key}: ${err}`);
                });
        }
    }

    private async getAndCacheThrottleStatus(id: string, requestType: ThrottlerRequestType): Promise<void> {
        const key = this.getKey(id, requestType);
        return this.throttler.getThrottleStatus(id, requestType)
            .then((throttlerResponse) => {
                if (!throttlerResponse) {
                    this.throttlerResponseCache[key] = {
                        throttleStatus: false,
                        throttleReason: undefined,
                        retryAfterInMs: 0,
                    };
                } else {
                    this.throttlerResponseCache[key] = throttlerResponse;
                }
            })
            .catch((err) => {
                this.logger?.error(`Failed to retrieve Throttler status for ${key}: ${err}`);
            });
    }
}
