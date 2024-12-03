/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottlingMetrics,
	IThrottleAndUsageStorageManager,
	IUsageData,
} from "@fluidframework/server-services-core";

/**
 * In-memory cache implementation of IThrottleManager for testing
 * @internal
 */
export class TestThrottleAndUsageStorageManager implements IThrottleAndUsageStorageManager {
	private readonly throttlingCache: { [key: string]: IThrottlingMetrics } = {};
	private readonly usageCache: { [key: string]: IUsageData } = {};

	async setThrottlingMetric(id: string, throttleMetric: IThrottlingMetrics): Promise<void> {
		this.throttlingCache[id] = throttleMetric;
	}

	async getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined> {
		return this.throttlingCache[id];
	}

	async setThrottlingMetricAndUsageData(
		id: string,
		throttleMetric: IThrottlingMetrics,
		usageStorageId: string,
		usageData: IUsageData,
	): Promise<void> {
		this.throttlingCache[id] = throttleMetric;
		this.usageCache[usageStorageId] = usageData;
	}

	async setUsageData(id: string, usageData: IUsageData): Promise<void> {
		this.usageCache[id] = usageData;
	}

	async getUsageData(id: string): Promise<IUsageData> {
		return this.usageCache[id];
	}
}
