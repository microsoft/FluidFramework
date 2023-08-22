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
 * sampletext
 */
export function createSampledLogger(
	logger: ITelemetryBaseLogger,
	shouldSampleEventCallback: () => boolean,
) {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingEnabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger: ITelemetryBaseLogger = {
		send: (event: ITelemetryBaseEvent) => {
			if (isSamplingEnabled && shouldSampleEventCallback() === true) {
				logger.send(event);
			}
		},
	};

	return sampledLogger;
}

/**
 * sampletext
 */
export const createSystematicSamplingCallback = (samplingRate: number) => {
	const state = {
		eventsSinceLastSample: 0,
		isFirstEvent: true,
	};
	return () => {
		state.eventsSinceLastSample++;
		if (state.isFirstEvent) {
			state.isFirstEvent = false;
			return true;
		}
		const shouldSample = state.eventsSinceLastSample % samplingRate === 0;
		if (shouldSample) {
			state.eventsSinceLastSample = 0;
		}
		return shouldSample;
	};
};
