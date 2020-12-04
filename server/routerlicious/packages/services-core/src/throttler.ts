/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INackContent, NackErrorType } from "@fluidframework/protocol-definitions";

export interface IThrottlerResponse {
    throttleStatus: boolean;
    throttleReason: string;
    retryAfterInMs: number;
}

export interface IThrottlingMetrics extends IThrottlerResponse {
    count: number;
    lastCoolDownAt: number;
}

export class ThrottlingError implements INackContent {
    readonly code = 429;
    readonly type = NackErrorType.ThrottlingError;

    constructor(
        readonly message: string,
        readonly retryAfter: number,
    ) {
    }
}

export interface IThrottleStorageManager {
    /**
     * Store throttling metrics for the given id.
     */
    setThrottlingMetric(id: string, throttlingMetric: IThrottlingMetrics): Promise<void>;

    /**
     * Get throttling metrics for the given id.
     */
    getThrottlingMetric(id: string): Promise<IThrottlingMetrics>;
}

export interface IThrottlerHelper {
    /**
     * Updates throttling metric count for given id, runs rate-limiting algorithm, and updates throttle status.
     */
    updateCount(id: string, count: number): Promise<IThrottlerResponse>;

    /**
     * Retrieve most recent throttle status for given id.
     */
    getThrottleStatus(id: string): Promise<IThrottlerResponse>;
}

export interface IThrottler {
    /**
     * Increment the number of consumed throttle-able resources by weight.
     * @throws {ThrottlingError} when throttled.
     */
    incrementCount(id: string, weight?: number): void;

    /**
     * Decrement the number of consumed throttle-able resources by weight.
     */
    decrementCount(id: string, weight?: number): void;
}
