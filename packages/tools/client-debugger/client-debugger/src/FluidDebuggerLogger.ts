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
import {
	handleIncomingWindowMessage,
	IDebuggerMessage,
	InboundHandlers,
	MessageLoggingOptions,
	postMessagesToWindow,
	ITimestampedTelemetryEvent,
	TelemetryHistoryMessage,
	TelemetryEventMessage,
} from "./messaging";

/**
 * Logger implementation that posts all telemetry events to the window (globalThis object).
 *
 * **Messages it listens for:**
 *
 * - {@link GetTelemetryHistoryMessage}: When received, the logger will broadcast {@link TelemetryHistoryMessage}.
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link TelemetryHistoryMessage}: This is posted when requested (via {@link GetTelemetryHistoryMessage}).
 * - {@link TelemetryEventMessage}: This is posted any time a telemetry event is logged.
 * TODO: Document others as they are added.
 *
 * @remarks This logger is intended to integrate with the Fluid Debugger DevTools extension.
 *
 * @sealed
 * @internal
 */
export class FluidDebuggerLogger extends TelemetryLogger {
	/**
	 * Accumulated data for Telemetry logs.
	 */
	private readonly _telemetryLog: ITimestampedTelemetryEvent[];

	/**
	 * Message logging options used by the debugger.
	 */
	private readonly messageLoggingOptions: MessageLoggingOptions = {
		context: `FluidClientDebuggerLogger`,
	};

	/**
	 * Handlers for inbound messages related to the debugger.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		["GET_TELEMETRY_HISTORY"]: (untypedMessage) => {
			this.postLogHistory();
			return true;
		},
	};

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	private readonly windowMessageHandler = (
		event: MessageEvent<Partial<IDebuggerMessage>>,
	): void => {
		handleIncomingWindowMessage(event, this.inboundMessageHandlers, this.messageLoggingOptions);
	};

	/**
	 * Posts a list of {@link IDebuggerMessage} to the window (globalThis). It will be send
	 * when requesting all the telemetry history/log since logger created.
	 */
	private readonly postLogHistory = (): void => {
		postMessagesToWindow<TelemetryHistoryMessage>(this.messageLoggingOptions, {
			type: "TELEMETRY_HISTORY",
			data: {
				contents: this._telemetryLog,
			},
		});
	};

	// #endregion

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
		this._telemetryLog = [];

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);
	}

	/**
	 * Post a telemetry event to the window (globalThis object).
	 *
	 * @param event - the event to send
	 */
	public send(event: ITelemetryBaseEvent): void {
		// TODO: ability to disable the logger so this becomes a no-op

		const newEvent: ITimestampedTelemetryEvent = {
			logContent: this.prepareEvent(event),
			timestamp: Date.now(),
		};
		const newMessage: TelemetryEventMessage = {
			type: "TELEMETRY_EVENT",
			data: {
				contents: [newEvent],
			},
		};

		// insert log into the beginning of the array to show the latest log first
		this._telemetryLog.unshift(newEvent);
		// set log option to be undefined to avoid sending the log message to window console; these were too noisy
		postMessagesToWindow<TelemetryEventMessage>(undefined, newMessage);
	}
}
