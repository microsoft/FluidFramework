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
import { ITelemetryGenericEventExt, ITelemetryLoggerExt } from "./telemetryTypes";

/**
 * Like assert, but logs only if the condition is false, rather than throwing
 * @param condition - The condition to attest too
 * @param logger - The logger to log with
 * @param event - The string or event to log
 * @returns The outcome of the condition
 */
export function logIfFalse(
	condition: unknown,
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
 * Used in conjunction with the {@link createSampledLogger} to control logic for sampling events.
 *
 * @internal
 */
export interface IEventSampler<> {
	/**
	 * @returns true if the event should be sampled or false if not
	 */
	sample: () => boolean | undefined;
}

/**
 * A telemetry logger that has sampling capabilities
 *
 * @internal
 */
export interface ISampledTelemetryLogger extends ITelemetryLoggerExt {
	/**
	 * Indicates if the feature flag to disable sampling is set.
	 *
	 * @remarks Exposed to enable some advanced scenarios where the code using the sampled logger
	 * could take advantage of skipping the execution of some logic when it can determine
	 * it won't be necessary because the telemetry event that needs it wouldn't be
	 * emitted anyway.
	 */
	isSamplingDisabled: boolean;
	eventSampler?: IEventSampler;
}

/**
 * Wraps around an existing logger matching the {@link ITelemetryLoggerExt} interface and provides the ability to only log a subset of events using a sampling strategy.
 *
 * @remarks
 * The sampling functionality uses the Fluid telemetry logging configuration along with the optionally provided event sampling callback to determine whether an event should
 * be logged or not.
 *
 * Configuration object parameters:
 * 'Fluid.Telemetry.DisableSampling': if this config value is set to true, all events will be unsampled and therefore logged.
 * Otherwise only a sample will be logged according to the provided event sampler callback.
 *
 * Note that the same sampler is used for all APIs of the returned logger. If you want separate events flowing through the returned logger to be sampled separately, the {@IEventSampler} you provide should track them separately.
 *
 * @internal
 */
export function createSampledLogger(
	logger: ITelemetryLoggerExt,
	eventSampler?: IEventSampler,
): ISampledTelemetryLogger {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled = monitoringContext.config.getBoolean(
		"Fluid.Telemetry.DisableSampling",
	);

	const sampledLogger = {
		send: (event: ITelemetryBaseEvent): void => {
			// if sampling is disabled, log all events. Otherwise, use the eventSampler to determine if the event should be logged.
			if (isSamplingDisabled || (!isSamplingDisabled && eventSampler?.sample())) {
				logger.send(event);
			}
		},
		sendTelemetryEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || (!isSamplingDisabled && eventSampler?.sample())) {
				logger.sendTelemetryEvent(event);
			}
		},
		sendErrorEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || (!isSamplingDisabled && eventSampler?.sample())) {
				logger.sendErrorEvent(event);
			}
		},
		sendPerformanceEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || (!isSamplingDisabled && eventSampler?.sample())) {
				logger.sendPerformanceEvent(event);
			}
		},
		eventSampler,
		isSamplingDisabled: isSamplingDisabled === true,
	};

	return sampledLogger;
}
