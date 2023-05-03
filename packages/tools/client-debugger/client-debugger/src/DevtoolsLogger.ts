/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
	TelemetryLogger,
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
	 * Base telemetry logger provided by the consumer.
	 * All messages sent to the Devtools logger will be forwarded to this.
	 */
	private readonly baseLogger: ITelemetryBaseLogger | undefined;

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
	 * Creates a new DevtoolsLogger, which will post telemetry events to the Window, and will forward them to the
	 * provided baseLogger (if one is provided).
	 *
	 * @param baseLogger - (optional) Base logger to which all telemetry events will be forwarded (in addition to
	 * posting them to the Window).
	 * @param namespace - Telemetry event name prefix to add to all events.
	 * @param properties - Base properties to add to all events.
	 */
	public static create(
		baseLogger?: ITelemetryBaseLogger,
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
	): DevtoolsLogger {
		if (!baseLogger) {
			return new DevtoolsLogger(namespace, properties);
		}

		// TODO: what is this for?
		const devtoolsLoggerProperties = properties ?? this.tryGetBaseLoggerProps(baseLogger);

		return new DevtoolsLogger(
			namespace,
			devtoolsLoggerProperties,
			ChildLogger.create(baseLogger, namespace),
		);
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

	private constructor(
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
		baseLogger?: ITelemetryBaseLogger,
	) {
		super(namespace, properties);

		this.baseLogger = baseLogger;

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
		// Forward event to base logger
		this.baseLogger?.send(event);

		// TODO: ability to disable the logger so the rest of this becomes a no-op

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
