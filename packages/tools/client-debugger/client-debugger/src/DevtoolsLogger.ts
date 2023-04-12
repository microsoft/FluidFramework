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
	GetTelemetryHistory,
	handleIncomingWindowMessage,
	IDevtoolsMessage,
	InboundHandlers,
	MessageLoggingOptions,
	postMessagesToWindow,
	TelemetryHistory,
	TelemetryEvent,
} from "./messaging";
import { ITimestampedTelemetryEvent } from "./TelemetryMetadata";

/**
 * Logger implementation that posts all telemetry events to the window (globalThis object).
 *
 * **Messages it listens for:**
 *
 * - {@link GetTelemetryHistory.Message}: When received, the logger will broadcast {@link TelemetryHistory.Message}.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link TelemetryHistory.Message}: This is posted when requested (via {@link GetTelemetryHistory.Message}).
 * - {@link TelemetryEvent.Message}: This is posted any time a telemetry event is logged.
 *
 * TODO: Document others as they are added.
 *
 * @remarks This logger is intended to integrate with the Fluid DevTools browser extension.
 *
 * @sealed
 * @public
 */
export class DevtoolsLogger extends TelemetryLogger {
	/**
	 * Accumulated data for Telemetry logs.
	 */
	private readonly _telemetryLog: ITimestampedTelemetryEvent[];

	/**
	 * Message logging options used by the logger.
	 */
	private readonly messageLoggingOptions: MessageLoggingOptions = {
		context: `FluidDevtoolsLogger`,
	};

	/**
	 * Handlers for inbound messages related to the logger.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		[GetTelemetryHistory.MessageType]: (untypedMessage) => {
			this.postLogHistory();
			return true;
		},
	};

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	private readonly windowMessageHandler = (
		event: MessageEvent<Partial<IDevtoolsMessage>>,
	): void => {
		handleIncomingWindowMessage(event, this.inboundMessageHandlers, this.messageLoggingOptions);
	};

	/**
	 * Posts a {@link TelemetryHistory.Message} to the window (globalThis) containing the complete history of
	 * telemetry events.
	 */
	private readonly postLogHistory = (): void => {
		postMessagesToWindow(
			this.messageLoggingOptions,
			TelemetryHistory.createMessage({
				contents: this._telemetryLog,
			}),
		);
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
	): DevtoolsLogger {
		return new DevtoolsLogger(namespace, properties);
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
			return DevtoolsLogger.create(namespace, properties);
		}

		const multiSinkLogger = new MultiSinkLogger(undefined, properties);
		multiSinkLogger.addLogger(
			DevtoolsLogger.create(namespace, this.tryGetBaseLoggerProps(baseLogger)),
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
	 * Post a {@link TelemetryEvent.Message} to the window (globalThis) for the provided telemetry event.
	 *
	 * @param event - The telemetry event to send.
	 */
	public send(event: ITelemetryBaseEvent): void {
		// TODO: ability to disable the logger so this becomes a no-op

		const newEvent: ITimestampedTelemetryEvent = {
			logContent: this.prepareEvent(event),
			timestamp: Date.now(),
		};

		// insert log into the beginning of the array to show the latest log first
		this._telemetryLog.unshift(newEvent);

		// set log option to be undefined to avoid sending the log message to window console; these were too noisy
		postMessagesToWindow(
			undefined,
			TelemetryEvent.createMessage({
				event: newEvent,
			}),
		);
	}
}
