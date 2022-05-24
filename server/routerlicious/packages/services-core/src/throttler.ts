/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
        /**
         * Explanation for throttling.
         */
        readonly message: string,
        /**
         * Client should retry operation after this many seconds.
         */
        readonly retryAfter: number,
    ) {
    }
}

/**
 * Storage getter/setter with logic specific to throttling metrics.
 */
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

/**
 * Runs rate-limiting calculations for IThrottler.
 */
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

/**
 * Determines if an operation should be allowed or throttled.
 */
export interface IThrottler {
    /**
     * Increment the current processing count of operations by `weight`.
     * @throws {@link ThrottlingError} when throttled.
     */
    incrementCount(id: string, weight?: number): void;

    /**
     * Decrement the current processing count of operations by `weight`.
     */
    decrementCount(id: string, weight?: number): void;
}
