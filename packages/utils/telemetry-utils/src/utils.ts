/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryGenericEvent,
} from "@fluidframework/core-interfaces";
import { createChildMonitoringContext, loggerToMonitoringContext } from "./config";
import {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPropertiesExt,
} from "./telemetryTypes";

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

export function createSampledLogger(
	logger: ITelemetryBaseLogger,
	eventSampler: {
		poll: () => boolean;
	},
) {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger: ITelemetryBaseLogger = {
		send: (event: ITelemetryBaseEvent) => {
			if (isSamplingDisabled || eventSampler.poll() === true) {
				logger.send(event);
			}
		},
	};

	return sampledLogger;
}
/**
 * Wraps around an existing logger and applies a provided callback to determine if an event should be sampled.
 */
export function createSampledLoggerExt(
	logger: ITelemetryLoggerExt,
	eventSampler: {
		poll: () => boolean;
	},
) {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger = {
		send: (event: ITelemetryBaseEvent) => {
			if (isSamplingDisabled || eventSampler.poll() === true) {
				logger.send(event);
			}
		},
		sendTelemetryEvent: (event: ITelemetryGenericEventExt) => {
			if (isSamplingDisabled || eventSampler.poll() === true) {
				logger.sendTelemetryEvent(event);
			}
		},
		sendErrorEvent: (event: ITelemetryGenericEventExt) => {
			if (isSamplingDisabled || eventSampler.poll() === true) {
				logger.sendErrorEvent(event);
			}
		},
		sendPerformanceEvent: (event: ITelemetryGenericEventExt) => {
			if (isSamplingDisabled || eventSampler.poll() === true) {
				logger.sendPerformanceEvent(event);
			}
		},
		eventSampler,
	};
	return sampledLogger;
}

export interface SystematicEventSampler {
	poll: () => boolean;
	willSample: (eventCount: number) => boolean;
	state: {
		eventCount: number;
	};
}

/**
 * Given a samplingRate 'n', this function will return true on the very first execution
 * and then after the first will return true on every n + 1 execution.
 *
 * @param samplingRate - The nth event to sample. Note that modifying the moduloResult will change the behavior
 * @param defaultState - (Optional) Initializes the internal state to a specified value. This can be useful if
 * if the eventCount needs to be controlled by an external piece of logic. Defaults to object with attribute 'eventCount: -1' which will emit the first event.
 * @param autoIncrementCounter - (Optional) In some cases, you may not want the sampler to control incrementing the event count. Defaults to false.
 */
export const createSystematicEventSampler = (options: {
	samplingRate: number;
	defaultState?: {
		eventCount: number;
	};
	autoIncrementCounter?: boolean;
}): SystematicEventSampler => {
	const state = options.defaultState ?? {
		eventCount: -1,
	};

	if (!options.autoIncrementCounter) {
		return {
			poll: () => {
				return state.eventCount % options.samplingRate === 0;
			},
			willSample: (eventCount: number) => {
				return eventCount % options.samplingRate === 0;
			},
			state,
		};
	}

	return {
		poll: () => {
			state.eventCount++;
			const shouldSample = state.eventCount % options.samplingRate === 0;
			if (shouldSample) {
				state.eventCount = 0;
			}
			return shouldSample;
		},
		willSample: (eventCount: number) => {
			return eventCount % options.samplingRate === 0;
		},
		state,
	};
};

export function buildEventSampler<D, T extends ITelemetryPropertiesExt>(
	logger: ITelemetryBaseLogger,
	initialData: ITelemetryGenericEventExt & Partial<T>,
	sampleCallback: (data: D, current: Partial<T>) => "send" | "continue",
) {
	const mc = createChildMonitoringContext({ logger });
	let current = { ...initialData };
	return (data: D) => {
		const r = sampleCallback(data, current);
		if (r === "send" || mc.config.getBoolean("Fluid.Telemetry.DisableSampling") === true) {
			mc.logger.sendTelemetryEvent(current);
			current = { ...initialData };
		}
	};
}
