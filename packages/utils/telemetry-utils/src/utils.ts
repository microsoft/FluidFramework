/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryGenericEvent,
} from "@fluidframework/core-interfaces";
import { loggerToMonitoringContext } from "./config";

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
 * Wraps around an existing logger and applies a provided callback to determine if an event should be sampled.
 */
export function createSampledLogger(
	logger: ITelemetryBaseLogger,
	shouldSampleEventCallback: () => boolean,
) {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger: ITelemetryBaseLogger = {
		send: (event: ITelemetryBaseEvent) => {
			if (isSamplingDisabled || shouldSampleEventCallback() === true) {
				logger.send(event);
			}
		},
	};

	return sampledLogger;
}

/**
 * Given a samplingRate 'n', this function will return true on the very first execution
 * and then after the first will return true on every n + 1 execution.
 */
export const createSystematicSamplingCallback = (samplingRate: number) => {
	const state = {
		eventsSinceLastSample: -1,
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
