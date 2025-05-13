/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

import { loggerToMonitoringContext } from "./config.js";
import type { ITelemetryGenericEventExt, ITelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * An object that contains a callback used in conjunction with the {@link createSampledLogger} utility function to provide custom logic for sampling events.
 *
 * @internal
 */
export interface IEventSampler {
	/**
	 * @returns true if the event should be sampled or false if not
	 */
	sample: () => boolean;
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
}

/**
 * Wraps around an existing logger matching the {@link ITelemetryLoggerExt} interface and provides the ability to only log a subset of events using a sampling strategy provided by an ${@link IEventSampler}.
 * You can chose to not provide an event sampler which is effectively a no-op, meaning that it will be treated as if the sampler always returns true.
 *
 * @remarks
 * The sampling functionality uses the Fluid telemetry logging configuration along with the optionally provided event sampling callback to determine whether an event should
 * be logged or not.
 *
 * Configuration object parameters:
 * 'Fluid.Telemetry.DisableSampling': if this config value is set to true, all events will be unsampled and therefore logged.
 * Otherwise only a sample will be logged according to the provided event sampler callback.
 *
 * Note that the same sampler is used for all APIs of the returned logger. If you want separate events flowing through the returned logger to be sampled separately, the {@link IEventSampler} you provide should track them separately.
 *
 * @internal
 */
export function createSampledLogger(
	logger: ITelemetryLoggerExt,
	eventSampler?: IEventSampler,
	skipLoggingWhenSamplingIsDisabled?: boolean,
): ISampledTelemetryLogger {
	const monitoringContext = loggerToMonitoringContext(logger);
	const isSamplingDisabled =
		monitoringContext.config.getBoolean("Fluid.Telemetry.DisableSampling") ?? false;

	const sampledLogger = {
		send: (event: ITelemetryBaseEvent): void => {
			// The sampler uses the following logic for sending events:
			// 1. If isSamplingDisabled is true, then this means events should be unsampled. Therefore we send the event without any checks.
			// 2. If isSamplingDisabled is false, then event should be sampled using the event sampler, if the sampler is not defined just send all events, other use the eventSampler.sample() method.
			// 3. If skipLoggingWhenSamplingIsDisabled is true, then no event is sent.
			if (isSamplingDisabled || eventSampler === undefined || eventSampler.sample()) {
				if (isSamplingDisabled && (skipLoggingWhenSamplingIsDisabled ?? false)) {
					return;
				}
				logger.send(event);
			}
		},
		sendTelemetryEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || eventSampler === undefined || eventSampler.sample()) {
				if (isSamplingDisabled && (skipLoggingWhenSamplingIsDisabled ?? false)) {
					return;
				}
				logger.sendTelemetryEvent(event);
			}
		},
		sendErrorEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || eventSampler === undefined || eventSampler.sample()) {
				if (isSamplingDisabled && (skipLoggingWhenSamplingIsDisabled ?? false)) {
					return;
				}
				logger.sendErrorEvent(event);
			}
		},
		sendPerformanceEvent: (event: ITelemetryGenericEventExt): void => {
			if (isSamplingDisabled || eventSampler === undefined || eventSampler.sample()) {
				if (isSamplingDisabled && (skipLoggingWhenSamplingIsDisabled ?? false)) {
					return;
				}
				logger.sendPerformanceEvent(event);
			}
		},
		isSamplingDisabled,
	};

	return sampledLogger;
}

/**
 * Runs the specified function and returns an object with the time it took to run as well as any output from it.
 * @remarks Useful in conjunction with {@link TelemetryEventBatcher}.
 *
 * @param codeToMeasure - The code to be executed and measured.
 * @returns The total duration of the code execution and whatever the passed-in code block returns.
 * @internal
 */
export function measure<T>(codeToMeasure: () => T): { duration: number; output: T } {
	const start = performance.now();
	const output = codeToMeasure();
	const duration = performance.now() - start;
	return { duration, output };
}
