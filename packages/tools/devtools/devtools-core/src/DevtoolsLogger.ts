/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

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
 * This logger is intended to integrate with the Fluid DevTools browser extension.
 *
 * @remarks
 *
 * This logger optionally wraps a provided base logger, and forwards all events to that logger (in addition to posting
 * data to the window).
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
 * @sealed
 * @public
 */
export class DevtoolsLogger implements ITelemetryBaseLogger {
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
		[GetTelemetryHistory.MessageType]: async (untypedMessage) => {
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

	public constructor(baseLogger?: ITelemetryBaseLogger) {
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

		try {
			const newEvent: ITimestampedTelemetryEvent = {
				logContent: event,
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
		} catch (error) {
			// Eat the error to ensure that Devtools logic doesn't crash the consuming application.
			console.error(error);
		}
	}
}
