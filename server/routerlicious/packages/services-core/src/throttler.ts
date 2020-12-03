/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INackContent, NackErrorType } from "@fluidframework/protocol-definitions";

export enum ThrottlerRequestType {
    OpenSocketConn = "OpenSocketConn",
    SubmitOp = "SubmitOp",
    AlfredRest = "AlfredRest",
    HistorianRest = "HistorianRest",
}

export interface IThrottlerResponse {
    throttleStatus: boolean;
    throttleReason: string;
    retryAfterInMs: number;
}

export interface IRequestMetrics extends IThrottlerResponse {
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
     * Add a request's metrics to the tracked requests.
     */
    setRequestMetric(id: string, requestMetric: IRequestMetrics): Promise<void>;

    /**
     * Get a request's metrics from the tracked requests.
     */
    getRequestMetric(id: string): Promise<IRequestMetrics>;
}

export interface IThrottlerHelper {
    /**
     * Updates request count for given id, runs rate-limiting algorithm, and updates throttleStatus.
     */
    updateRequestCount(id: string, count: number): Promise<IThrottlerResponse>;

    /**
     * Retrieve most recent throttle status for given id.
     */
    getThrottleStatus(id: string): Promise<IThrottlerResponse>;
}

export interface IThrottler {
    /**
     * Open a throttle-able request.
     * @throws {ThrottlingError} when throttled and cannot open request.
     */
    openRequest(id: string, weight?: number): void;

    /**
     * Mark an opened throttle-able request as closed.
     */
    closeRequest(id: string, weight?: number): void;
}
