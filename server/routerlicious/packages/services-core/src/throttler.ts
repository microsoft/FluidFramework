/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INackContent, NackErrorType } from "@fluidframework/protocol-definitions";

export enum ThrottlerRequestType {
    OpenSocketConn = "OpenSocketConn",
    SubmitOp = "SubmitOp",
    AlfredHttps = "AlfredHttps",
    HistorianHttps = "HistorianHttps",
}

export interface IRequestMetrics {
    count: number;
    lastCoolDownAt: number;
    throttleStatus: boolean;
    throttleReason: string;
    retryAfterInMs: number;
}

export interface IThrottlerResponse {
    throttleStatus: boolean;
    throttleReason: string;
    retryAfterInMs: number;
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

export interface IThrottleManager {
    /**
     * Add a request's metrics to the tracked requests.
     */
    setRequestMetric(id: string, requestType: ThrottlerRequestType, requestMetric: IRequestMetrics): Promise<void>;

    /**
     * Get a request's metrics from the tracked requests.
     */
    getRequestMetric(id: string, requestType: ThrottlerRequestType): Promise<IRequestMetrics>;
}

export interface IThrottler {
    /**
     * Updates request count for given id and requestType, runs rate-limiting algorithm, and updates throttleStatus.
     */
    updateRequestCount(id: string, requestType: ThrottlerRequestType, count: number): Promise<IThrottlerResponse>;

    /**
     * Retrieve most recent throttle status for given id and requestType.
     */
    getThrottleStatus(id: string, requestType: ThrottlerRequestType): Promise<IThrottlerResponse>;
}

export interface IThrottlerHelper {
    /**
     * Open a throttle-able request.
     * @throws {ThrottlingError} when throttled and cannot open request.
     */
    openRequest(id: string, requestType: ThrottlerRequestType): void;

    /**
     * Mark an opened throttle-able request as closed.
     */
    closeRequest(id: string, requestType: ThrottlerRequestType): void;
}
