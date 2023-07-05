/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getRandomInt } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export async function executeApiWithMetric<U>(
	api: () => Promise<U>,
	metricName: string,
	apiName: string,
	metricEnabled: boolean,
	samplingPeriod?: number,
	telemetryProperties?: Record<string, any>,
): Promise<U> {
	// If generating a metric is not enabled, we just execute the API.
	// We also do the same if sampling tells us to skip the metric for
	// this instance (when a sampling period is provided).
	if (!metricEnabled || (samplingPeriod && getRandomInt(samplingPeriod) !== 0)) {
		return api();
	}
	const metric = Lumberjack.newLumberMetric(metricName, telemetryProperties);
	try {
		const result = await api();
		metric.success(`${metricName}: ${apiName} success`);
		return result;
	} catch (error: any) {
		metric.error(`${metricName}: ${apiName} error`, error);
		throw error;
	}
}
