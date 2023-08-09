/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryGenericEvent,
} from "@fluidframework/core-interfaces";
import { createChildMonitoringContext } from "./config";

/**
 * Like assert, but logs only if the condition is false, rather than throwing
 * @param condition - The condition to attest too
 * @param logger - The logger to log with
 * @param event - The string or event to log
 * @returns - The outcome of the condition
 */
export function logIfFalse(
	condition: any,
	logger: ITelemetryBaseLogger,
	event: string | ITelemetryGenericEvent,
): condition is true {
	if (condition) {
		return true;
	}
	const newEvent: ITelemetryBaseEvent =
		typeof event === "string"
			? { eventName: event, category: "error" }
			: { category: "error", ...event };
	logger.send(newEvent);
	return false;
}

/**
 * sampletext
 */
export function createSampledLoggerSend(
	logger: ITelemetryBaseLogger,
	shouldSampleEventCallback: () => boolean,
) {
	const mc = createChildMonitoringContext({ logger });
	const isSamplingEnabled = mc.config.getBoolean("Fluid.Telemetry.DisableSampling");

	return (event: ITelemetryBaseEvent) => {
		if (isSamplingEnabled && shouldSampleEventCallback() === true) {
			logger.send(event);
		}
	};
}

/**
 * sampletext
 */
export const createSystematicSamplingCallback = (samplingRate: number) => {
	const state = {
		eventsSinceLastSample: 0,
		samplingRate,
	};
	return () => {
		state.eventsSinceLastSample++;
		const shouldSample = state.eventsSinceLastSample % samplingRate === 0;
		if (shouldSample) {
			state.eventsSinceLastSample = 0;
		}
		return shouldSample;
	};
};
