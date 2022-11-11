/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LivenessMonitorProperties, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import Redis from "ioredis";

export async function redisPingCheck(client: Redis.Redis): Promise<void> {
	const metric = Lumberjack.newLumberMetric(
		LumberEventName.RedisPing,
		{
			[LivenessMonitorProperties.redisHost]: client.options.host,
		});
	try {
		await client.ping();
		metric.success("redisPing succeeded");
	} catch (err) {
		metric.error("redisPing failed", err);
		throw err;
	}
}
