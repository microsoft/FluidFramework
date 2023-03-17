/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
	TelemetryLogger,
	MultiSinkLogger,
	ChildLogger,
	ITelemetryLoggerPropertyBags,
} from "@fluidframework/telemetry-utils";
import { debuggerMessageSource, postMessageToWindow, TelemetryEventMessage } from "./messaging";

/**
 * Logger implementation that posts all telemetry events to the window (globalThis object).
 *
 * @remarks This logger is intended to integrate with the Fluid Debugger DevTools extension.
 *
 * @sealed
 * @internal
 */
export class FluidDebuggerLogger extends TelemetryLogger {
	/**
	 * Create an instance of this logger
	 * @param namespace - Telemetry event name prefix to add to all events
	 * @param properties - Base properties to add to all events
	 */
	public static create(
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
	): TelemetryLogger {
		return new FluidDebuggerLogger(namespace, properties);
	}

	/**
	 * Mix in this logger with another.
	 * The returned logger will output events to the newly created DevTools extension logger *and* the base logger.
	 * @param namespace - Telemetry event name prefix to add to all events
	 * @param baseLogger - Base logger to output events (in addition to DevTools extension logger being created). Can be undefined.
	 * @param properties - Base properties to add to all events
	 */
	public static mixinLogger(
		namespace?: string,
		baseLogger?: ITelemetryBaseLogger,
		properties?: ITelemetryLoggerPropertyBags,
	): TelemetryLogger {
		if (!baseLogger) {
			return FluidDebuggerLogger.create(namespace, properties);
		}

		const multiSinkLogger = new MultiSinkLogger(undefined, properties);
		multiSinkLogger.addLogger(
			FluidDebuggerLogger.create(namespace, this.tryGetBaseLoggerProps(baseLogger)),
		);
		multiSinkLogger.addLogger(ChildLogger.create(baseLogger, namespace));

		return multiSinkLogger;
	}

	private static tryGetBaseLoggerProps(
		baseLogger?: ITelemetryBaseLogger,
	): ITelemetryLoggerPropertyBags | undefined {
		if (baseLogger instanceof TelemetryLogger) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (baseLogger as any as { properties: ITelemetryLoggerPropertyBags }).properties;
		}
		return undefined;
	}

	private constructor(namespace?: string, properties?: ITelemetryLoggerPropertyBags) {
		super(namespace, properties);
	}

	/**
	 * Post a telemetry event to the window (globalThis object).
	 *
	 * @param event - the event to send
	 */
	public send(event: ITelemetryBaseEvent): void {
		// TODO: ability to disable the logger so this becomes a no-op

		const newEvent: ITelemetryBaseEvent = this.prepareEvent(event);

		postMessageToWindow<TelemetryEventMessage>(undefined, {
			source: debuggerMessageSource,
			type: "TELEMETRY_EVENT",
			data: {
				contents: newEvent,
			},
		});
	}
}
