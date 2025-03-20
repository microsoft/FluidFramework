/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { INackContent, NackErrorType } from "@fluidframework/protocol-definitions";
import { IUsageData } from ".";

/**
 * @internal
 */
export interface IThrottlerResponse {
	throttleStatus: boolean;
	throttleReason: string;
	retryAfterInMs: number;
}

/**
 * @internal
 */
export interface IThrottlingMetrics extends IThrottlerResponse {
	count: number;
	lastCoolDownAt: number;
}

/**
 * @internal
 */
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
	) {}
}

/**
 * Storage getter/setter with logic specific to throttling metrics and usage data.
 * @internal
 */
export interface IThrottleAndUsageStorageManager {
	/**
	 * Store throttling metrics for the given id.
	 */
	setThrottlingMetric(id: string, throttlingMetric: IThrottlingMetrics): Promise<void>;

	/**
	 * Get throttling metrics for the given id.
	 */
	getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined>;

	/**
	 * Store throttling metrics and usage data for the given id.
	 */
	setThrottlingMetricAndUsageData(
		id: string,
		throttlingMetric: IThrottlingMetrics,
		usageStorageId: string,
		usageData: IUsageData,
	): Promise<void>;

	/**
	 * Store usage data for given id.
	 */
	setUsageData(id: string, usageData: IUsageData): Promise<void>;

	/**
	 * Get usage data for given id.
	 */
	getUsageData(id: string): Promise<IUsageData | undefined>;
}

/**
 * Runs rate-limiting calculations for IThrottler.
 * @internal
 */
export interface IThrottlerHelper {
	/**
	 * Updates throttling metric count for given id, runs rate-limiting algorithm, and updates throttle status.
	 * Optionally, stores usage data if provided with.
	 */
	updateCount(
		id: string,
		count: number,
		usageStorageId?: string,
		usageData?: IUsageData,
	): Promise<IThrottlerResponse>;

	/**
	 * Retrieve most recent throttle status for given id.
	 * @returns Throttle status if found, otherwise undefined if given id is not already tracked for throttling.
	 */
	getThrottleStatus(id: string): Promise<IThrottlerResponse | undefined>;
}

/**
 * Determines if an operation should be allowed or throttled.
 * @internal
 */
export interface IThrottler {
	/**
	 * Increment the current processing count of operations by `weight`.
	 * Optionally, stores usage data if provided with.
	 * @throws {@link ThrottlingError} when throttled.
	 */
	incrementCount(
		id: string,
		weight?: number,
		usageStorageId?: string,
		usageData?: IUsageData,
	): void;

	/**
	 * Decrement the current processing count of operations by `weight`.
	 */
	decrementCount(id: string, weight?: number): void;
}
