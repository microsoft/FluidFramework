/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottleAndUsageStorageManager,
	IThrottlingMetrics,
	IUsageData,
} from "@fluidframework/server-services-core";
import {
	executeRedisMultiWithHmsetExpire,
	executeRedisMultiWithHmsetExpireAndLpush,
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import {
	BaseTelemetryProperties,
	CommonProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";

/**
 * Manages storage of throttling metrics and usage data in redis.
 * @internal
 */
export class RedisThrottleAndUsageStorageManager implements IThrottleAndUsageStorageManager {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "throttle";

	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(
			{ [CommonProperties.telemetryGroupName]: "throttling" }, // lumber properties
			"Throttle Manager Redis Error", // error message
		);
	}

	public async setThrottlingMetric(
		id: string,
		throttlingMetric: IThrottlingMetrics,
	): Promise<void> {
		const throttlingKey = this.getKey(id);

		return executeRedisMultiWithHmsetExpire(
			this.redisClientConnectionManager.getRedisClient(),
			throttlingKey,
			throttlingMetric as { [key: string]: any },
			this.expireAfterSeconds,
		);
	}

	public async setThrottlingMetricAndUsageData(
		throttlingId: string,
		throttlingMetric: IThrottlingMetrics,
		usageStorageId: string,
		usageData: IUsageData,
	): Promise<void> {
		const throttlingKey = this.getKey(throttlingId);
		const usageDataString = JSON.stringify(usageData);
		Lumberjack.info(`Pushing usage data - id: ${usageStorageId}, data: ${usageDataString}}`, {
			[BaseTelemetryProperties.tenantId]: usageData.tenantId,
			[BaseTelemetryProperties.documentId]: usageData.documentId,
			[CommonProperties.clientId]: usageData.clientId,
		});

		return executeRedisMultiWithHmsetExpireAndLpush(
			this.redisClientConnectionManager.getRedisClient(),
			throttlingKey,
			throttlingMetric as { [key: string]: any },
			usageStorageId,
			usageDataString,
			this.expireAfterSeconds,
		);
	}

	public async getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined> {
		const throttlingMetric = await this.redisClientConnectionManager
			.getRedisClient()
			.hgetall(this.getKey(id));
		if (Object.keys(throttlingMetric).length === 0) {
			return undefined;
		}

		// All values retrieved from Redis are strings, so they must be parsed
		return {
			count: Number.parseInt(throttlingMetric.count, 10),
			lastCoolDownAt: Number.parseInt(throttlingMetric.lastCoolDownAt, 10),
			throttleStatus: throttlingMetric.throttleStatus === "true",
			throttleReason: throttlingMetric.throttleReason,
			retryAfterInMs: Number.parseInt(throttlingMetric.retryAfterInMs, 10),
		};
	}

	public async setUsageData(id: string, usageData: IUsageData): Promise<void> {
		const usageDataString = JSON.stringify(usageData);
		Lumberjack.info(`Pushing usage data - id: ${id}, data: ${usageDataString}}`, {
			[BaseTelemetryProperties.tenantId]: usageData.tenantId,
			[BaseTelemetryProperties.documentId]: usageData.documentId,
			[CommonProperties.clientId]: usageData.clientId,
		});
		await this.redisClientConnectionManager.getRedisClient().lpush(id, usageDataString);
	}

	public async getUsageData(id: string): Promise<IUsageData | undefined> {
		const usageDataString = await this.redisClientConnectionManager.getRedisClient().rpop(id);
		if (usageDataString) {
			return JSON.parse(usageDataString) as IUsageData;
		}
		return undefined;
	}

	private getKey(id: string): string {
		return `${this.prefix}:${id}`;
	}
}
