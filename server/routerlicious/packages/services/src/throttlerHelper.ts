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

export class ThrottlerHelper implements IThrottlerHelper {
    // TODO: Should these cache values expire? Use node-cache package perhaps?
    private readonly lastThrottleUpdateAtMap: { [key: string]: number } = {};
    private readonly requestDeltaMap: { [key: string]: number } = {};
    private readonly throttlerResponseCache: { [key: string]: IThrottlerResponse } = {};

    constructor(
        private readonly throttler: IThrottler,
        private readonly minThrottleIntervalInMs: number,
        private readonly logger: ILogger,
    ) {
    }

    /**
     * Uses caching to bring added latency down to constant time (from cache connection time)
     */
    public openRequest(id: string, requestType: ThrottlerRequestType): void {
        const key = this.getKey(id, requestType);

        if (this.requestDeltaMap[key] === undefined) {
            this.requestDeltaMap[key] = 0;
        }
        this.requestDeltaMap[key]++;

        const now = Date.now();
        const lastThrottleUpdateAt = this.lastThrottleUpdateAtMap[key] || 0;
        if (now - lastThrottleUpdateAt > this.minThrottleIntervalInMs) {
            const requestDelta = this.requestDeltaMap[key];
            this.lastThrottleUpdateAtMap[key] = now;
            this.requestDeltaMap[key] = 0;
            void this.throttler.updateRequestCount(id, requestType, requestDelta)
                .then((throttlerResponse) => {
                    this.throttlerResponseCache[key] = throttlerResponse;
                })
                .catch((err) => {
                    this.logger.error(`Failed to update Throttler request count for ${key}: ${err}`);
                });
        }

        // TODO: decide if this is necessary. Should be okay to accept requests until next request count update
        const cachedThrottlerResponse = this.throttlerResponseCache[key];
        if (!cachedThrottlerResponse) {
            void this.throttler.getThrottleStatus(id, requestType)
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
                    this.logger.error(`Failed to retrieve Throttler status for ${key}: ${err}`);
                });
        } else if (cachedThrottlerResponse.throttleStatus) {
            throw new ThrottlingError(
                cachedThrottlerResponse.throttleReason,
                Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000),
            );
        }
    }

    public closeRequest(id: string, requestType: ThrottlerRequestType): void {
        const key = this.getKey(id, requestType);
        if (this.requestDeltaMap[key] === undefined) {
            this.requestDeltaMap[key] = 1;
        }
        this.requestDeltaMap[key]--;
    }

    private getKey(id: string, requestType: ThrottlerRequestType): string {
        return `${id}_${requestType}`;
    }
}
