/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import {
	ITelemetryLoggerExt,
	ITelemetryLoggerPropertyBags,
	createMultiSinkLogger,
	eventNamespaceSeparator,
	formatTick,
} from "@fluidframework/telemetry-utils/internal";
// This import style is necessary to ensure the emitted JS code works in both CJS and ESM.
import debugPkg from "debug";
import type { IDebugger } from "debug";

const { debug: registerDebug } = debugPkg;

/**
 * Implementation of debug logger
 */
export class DebugLogger implements ITelemetryBaseLogger {
	/**
	 * Mix in debug logger with another logger.
	 * Returned logger will output events to both newly created debug logger, as well as base logger
	 * @param namespace - Telemetry event name prefix to add to all events
	 * @param properties - Base properties to add to all events
	 * @param propertyGetters - Getters to add additional properties to all events
	 * @param baseLogger - Base logger to output events (in addition to debug logger being created). Can be undefined.
	 */
	public static mixinDebugLogger(
		namespace: string,
		baseLogger?: ITelemetryBaseLogger,
		properties?: ITelemetryLoggerPropertyBags,
	): ITelemetryLoggerExt {
		// Setup base logger upfront, such that host can disable it (if needed)
		const debug = registerDebug(namespace);

		// Create one for errors that is always enabled
		// It can be silenced by replacing console.error if the debug namespace is not enabled.
		const debugErr = registerDebug(namespace);
		debugErr.log = function (...args: unknown[]): void {
			if (debug.enabled === true) {
				// if the namespace is enabled, just use the default logger
				registerDebug.log(...args);
			} else {
				// other wise, use the console logger (which could be replaced and silenced)
				console.error(...args);
			}
		};
		debugErr.enabled = true;

		return createMultiSinkLogger({
			namespace,
			loggers: [baseLogger, new DebugLogger(debug, debugErr)],
			properties,
			tryInheritProperties: true,
		});
	}

	private constructor(
		private readonly debug: IDebugger,
		private readonly debugErr: IDebugger,
	) {}

	/**
	 * Send an event to debug loggers
	 *
	 * @param event - the event to send
	 */
	public send(event: ITelemetryBaseEvent): void {
		const newEvent: ITelemetryBaseProperties = { ...event };
		const isError = newEvent.category === "error";
		let logger = isError ? this.debugErr : this.debug;

		// Use debug's coloring schema for base of the event
		const index = event.eventName.lastIndexOf(eventNamespaceSeparator);
		const name = event.eventName.slice(Math.max(0, index + 1));
		if (index > 0) {
			logger = logger.extend(event.eventName.slice(0, index));
		}
		newEvent.eventName = undefined;

		let tick = "";
		tick = `tick=${formatTick(performanceNow())}`;

		// Extract stack to put it last, but also to avoid escaping '\n' in it by JSON.stringify below
		const stack = newEvent.stack ?? "";
		newEvent.stack = undefined;

		// Watch out for circular references - they can come from two sources
		// 1) error object - we do not control it and should remove it and retry
		// 2) properties supplied by telemetry caller - that's a bug that should be addressed!
		let payload: string;
		try {
			payload = JSON.stringify(newEvent);
		} catch {
			newEvent.error = undefined;
			payload = JSON.stringify(newEvent);
		}

		if (payload === "{}") {
			payload = "";
		}

		// Force errors out, to help with diagnostics
		if (isError) {
			logger.enabled = true;
		}

		// Print multi-line.
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		logger(`${name} ${payload} ${tick} ${stack}`);
	}
}
