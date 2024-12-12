/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottlerResponse,
	IThrottlerHelper,
	IThrottlingMetrics,
} from "@fluidframework/server-services-core";

/**
 * Super simple Token Bucket IThrottlerHelper implementation for use in tests.
 * @internal
 */
export class TestThrottlerHelper implements IThrottlerHelper {
	private readonly throttleStorage: { [key: string]: IThrottlingMetrics };

	constructor(
		/**
		 * Number of operations allowed per ms.
		 */
		private readonly opsPerMs: number,
	) {
		this.throttleStorage = {};
	}

	public async updateCount(id: string, count: number): Promise<IThrottlerResponse> {
		const now = Date.now();

		// get stored throttling metric or start fresh
		const throttlingMetrics: IThrottlingMetrics = this.throttleStorage[id] || {
			count: this.opsPerMs,
			lastCoolDownAt: now,
			throttleStatus: false,
			throttleReason: undefined,
			retryAfterInMs: 0,
		};

		// cooldown count
		const timeSinceLastCooldown = now - throttlingMetrics.lastCoolDownAt;
		throttlingMetrics.count += Math.floor(timeSinceLastCooldown * this.opsPerMs);
		throttlingMetrics.lastCoolDownAt = now;

		// adjust count
		throttlingMetrics.count -= count;

		// check throttle
		if (throttlingMetrics.count < 0) {
			const exceededByCount = Math.abs(throttlingMetrics.count);
			throttlingMetrics.throttleStatus = true;
			throttlingMetrics.retryAfterInMs = exceededByCount / this.opsPerMs;
			throttlingMetrics.throttleReason = `Count exceeded by ${exceededByCount} at ${now}`;
		} else {
			throttlingMetrics.throttleStatus = false;
			throttlingMetrics.retryAfterInMs = 0;
			throttlingMetrics.throttleReason = "";
		}

		// update stored throttling metric
		this.throttleStorage[id] = throttlingMetrics;

		return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetrics);
	}

	public async getThrottleStatus(id: string): Promise<IThrottlerResponse | undefined> {
		const throttlingMetrics = this.throttleStorage[id];

		if (!throttlingMetrics) {
			return undefined;
		}

		return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetrics);
	}

	private getThrottlerResponseFromThrottlingMetrics(
		throttlingMetrics: IThrottlingMetrics,
	): IThrottlerResponse {
		return {
			throttleStatus: throttlingMetrics.throttleStatus,
			throttleReason: throttlingMetrics.throttleReason,
			retryAfterInMs: throttlingMetrics.retryAfterInMs,
		};
	}
}
