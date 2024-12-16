/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottler,
	IThrottlerHelper,
	IThrottlerResponse,
	ThrottlingError,
	ILogger,
	IUsageData,
} from "@fluidframework/server-services-core";
import LRUCache from "lru-cache";
import {
	CommonProperties,
	Lumberjack,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";

/**
 * A lenient implementation of IThrottlerHelper that prioritizes low latency over strict throttling.
 * This should be used for implementing throttling in places where latency matters more than accuracy,
 * such as service endpoints or socket connections.
 * @internal
 */
export class Throttler implements IThrottler {
	private readonly lastThrottleUpdateAtMap: LRUCache<string, number>;
	private readonly countDeltaMap: LRUCache<string, number>;
	private readonly throttlerResponseCache: LRUCache<string, IThrottlerResponse>;

	constructor(
		private readonly throttlerHelper: IThrottlerHelper,
		private readonly minThrottleIntervalInMs: number = 1000000,
		private readonly logger?: ILogger,
		/**
		 * Maximum number of keys that should be internally tracked at a given time.
		 * Fine tune this and cache age to balance accuracy and memory consumption.
		 * If this value is less than number of keys (traffic) per cache age time, the in-memry cache can overflow.
		 * Default: 1,000
		 */
		maxCacheSize: number = 1000,
		/**
		 * When to mark internal cache values as stale, in milliseconds. In production, this value should not be
		 * lower than minThrottleIntervalInMs, otherwise throttle counts will be lost between calculation intervals.
		 * Default: 1min
		 */
		maxCacheAge: number = 1000 * 60,
		/**
		 * Throttling can generate a lot of telemetry, which can be expensive and/or taxing on resources.
		 * Use this flag to enable/disable extra telemetry that is useful for validating throttling config correctness.
		 * Default: false
		 */
		private readonly enableEnhancedTelemetry: boolean = false,
	) {
		const cacheOptions: LRUCache.Options<string, any> = {
			max: maxCacheSize,
			maxAge: maxCacheAge,
		};
		this.lastThrottleUpdateAtMap = new LRUCache({
			...cacheOptions,
			dispose: this.enableEnhancedTelemetry
				? (key, value: number) => {
						// Utilize the opportunity to log information before an item is removed from the cache.
						// If a cache entry is removed too soon, it can negatively impact the correctness of throttling.
						const now = Date.now();
						if (now - value < maxCacheAge) {
							// lastThrottleUpdateAt value should be equal to the time that the cached value was last updated.
							// If it is being disposed before the maxCacheAge is reached, it indicates that the cache is full.
							const telemetryProperties = this.getBaseTelemetryProperties(key);
							const lumberjackProperties = {
								...telemetryProperties.baseLumberjackProperties,
								ageInMs: now - value,
							};
							this.logger?.warn(
								`Purged lastThrottleUpdateAt for ${key} before maxAge reached`,
								{ messageMetaData: telemetryProperties.baseMessageMetaData },
							);
							Lumberjack.warning(
								`Purged lastThrottleUpdateAt for ${key} before maxAge reached`,
								lumberjackProperties,
							);
						}
				  }
				: undefined,
		});
		this.countDeltaMap = new LRUCache(cacheOptions);
		this.throttlerResponseCache = new LRUCache(cacheOptions);
	}

	/**
	 * Increments operation count and calculates throttle status of given operation id.
	 * Uses most recently calculated throttle status to determine current throttling, while updating in the background.
	 * @throws {@link ThrottlingError} if throttled
	 */
	public incrementCount(
		id: string,
		weight: number = 1,
		usageStorageId?: string,
		usageData?: IUsageData,
	): void {
		const telemetryProperties = this.getBaseTelemetryProperties(id);

		this.updateCountDelta(id, weight);

		this.updateAndCacheThrottleStatus(id, usageStorageId, usageData).catch((error) => {
			this.logger?.error(
				`Error encountered updating and/or caching throttle status for ${id}: ${error}`,
				{ messageMetaData: telemetryProperties.baseMessageMetaData },
			);
			Lumberjack.error(
				`Error encountered updating and/or caching throttle status for ${id}`,
				telemetryProperties.baseLumberjackProperties,
				error,
			);
		});

		// check cached throttle status, but allow operation through if status is not yet cached
		const cachedThrottlerResponse = this.throttlerResponseCache.get(id);
		if (cachedThrottlerResponse && cachedThrottlerResponse.throttleStatus) {
			const retryAfterInSeconds = Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000);
			this.logger?.info(`Throttled: ${id}`, {
				messageMetaData: {
					...telemetryProperties.baseMessageMetaData,
					reason: cachedThrottlerResponse.throttleReason,
					retryAfterInSeconds,
				},
			});
			Lumberjack.info(`Throttled: ${id}`, {
				...telemetryProperties.baseLumberjackProperties,
				[ThrottlingTelemetryProperties.reason]: cachedThrottlerResponse.throttleReason,
				[ThrottlingTelemetryProperties.retryAfterInSeconds]: retryAfterInSeconds,
			});
			// eslint-disable-next-line @typescript-eslint/no-throw-literal
			throw new ThrottlingError(cachedThrottlerResponse.throttleReason, retryAfterInSeconds);
		}
	}

	/**
	 * Decrements operation count of given operation id.
	 */
	public decrementCount(id: string, weight: number = 1): void {
		this.updateCountDelta(id, -weight);
	}

	private updateCountDelta(id: string, value: number): void {
		const currentValue = this.countDeltaMap.get(id) || 0;

		this.countDeltaMap.set(id, currentValue + value);
	}

	private async updateAndCacheThrottleStatus(
		id: string,
		usageStorageId?: string,
		usageData?: IUsageData,
	): Promise<void> {
		const telemetryProperties = this.getBaseTelemetryProperties(id);

		const now = Date.now();
		if (this.lastThrottleUpdateAtMap.get(id) === undefined) {
			if (this.enableEnhancedTelemetry) {
				this.logger?.info(`Starting to track throttling status for ${id}`, {
					messageMetaData: telemetryProperties.baseMessageMetaData,
				});
				Lumberjack.info(
					`Starting to track throttling status for ${id}`,
					telemetryProperties.baseLumberjackProperties,
				);
			}
			this.lastThrottleUpdateAtMap.set(id, now);
		}

		const lastThrottleUpdateTime = this.lastThrottleUpdateAtMap.get(id);
		if (
			lastThrottleUpdateTime !== undefined &&
			now - lastThrottleUpdateTime > this.minThrottleIntervalInMs
		) {
			const countDelta = this.countDeltaMap.get(id) ?? 0;
			this.lastThrottleUpdateAtMap.set(id, now);
			this.countDeltaMap.set(id, 0);
			const messageMetaData = {
				...telemetryProperties.baseMessageMetaData,
				weight: countDelta,
			};
			const lumberjackProperties = {
				...telemetryProperties.baseLumberjackProperties,
				[ThrottlingTelemetryProperties.weight]: countDelta,
			};
			// poplulate usageData with relevant data.
			if (usageData) {
				usageData.value = countDelta;
				usageData.startTime = lastThrottleUpdateTime;
				usageData.endTime = now;
			}
			await this.throttlerHelper
				.updateCount(id, countDelta, usageStorageId, usageData)
				.then((throttlerResponse) => {
					if (this.enableEnhancedTelemetry) {
						this.logger?.info(`Incremented throttle count for ${id} by ${countDelta}`, {
							messageMetaData,
						});
						Lumberjack.info(
							`Incremented throttle count for ${id} by ${countDelta}`,
							lumberjackProperties,
						);
					}
					this.throttlerResponseCache.set(id, throttlerResponse);
				})
				.catch((err) => {
					this.logger?.error(`Failed to update throttling count for ${id}: ${err}`, {
						messageMetaData,
					});
					Lumberjack.error(
						`Failed to update throttling count for ${id}`,
						lumberjackProperties,
						err,
					);
				});
		}
	}

	private getBaseTelemetryProperties(key: string) {
		return {
			baseMessageMetaData: {
				key,
				eventName: "throttling",
			},
			baseLumberjackProperties: {
				[CommonProperties.telemetryGroupName]: "throttling",
				[ThrottlingTelemetryProperties.key]: key,
			},
		};
	}
}
