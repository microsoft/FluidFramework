/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IDebuggerMessage,
	isDebuggerMessage,
	MessageLoggingOptions,
} from "@fluid-tools/client-debugger";

import { IMessageRelayEvents, IMessageRelay, TypedPortConnection } from "../../messaging";
import {
	devToolsInitAcknowledgementType,
	DevToolsInitMessage,
	devToolsInitMessageType,
	devtoolsMessageSource,
	postMessageToPort,
} from "../messaging";

/**
 * Context string for logging.
 */
const loggingContext = "EXTENSION(DEVTOOLS_SCRIPT)";

/**
 * Formats the provided log message with the appropriate context information.
 */
function formatForLogging(text: string): string {
	return `${loggingContext}: ${text}`;
}

/**
 * Configuration for console logging.
 */
const messageLoggingOptions: MessageLoggingOptions = {
	context: loggingContext,
};

/**
 * Error logged when consumer attempts to access {@link BackgroundConnection} members after it
 * has been disposed.
 */
const accessDisposedError = formatForLogging("The message relay was previously disposed.");

/**
 * Message relay for communicating with the Background Script.
 */
export class BackgroundConnection
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	/**
	 * Port connection to the Background Script
	 */
	private backgroundServiceConnection: TypedPortConnection | undefined;

	/**
	 * Handler for incoming messages from {@link backgroundServiceConnection}.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private readonly backgroundMessageHandler = (message: Partial<IDebuggerMessage>): boolean => {
		if (!isDebuggerMessage(message)) {
			return false;
		}

		if (message.type === devToolsInitAcknowledgementType) {
			console.log(formatForLogging("Background initialization acknowledged."));

			this._connected = true;
			return this.emit("connected");
		} else {
			// Forward incoming message onto subscribers.
			// TODO: validate source
			console.log(
				formatForLogging(`Relaying "${message.type}" message from BACKGROUND_SCRIPT:`),
				message,
			);
			return this.emit("message", message);
		}
	};

	/**
	 * Private backing data for {@link BackgroundConnection.connected}.
	 *
	 * @remarks
	 *
	 * Note: this is not set to `true` upon initiating the connection with the background service.
	 * Instead, we wait until the service sends us an acknowledgement message following tab initialization.
	 */
	private _connected: boolean = false;

	/**
	 * Private backing data for {@link BackgroundConnection.disposed}.
	 */
	private _disposed: boolean = false;

	/**
	 * {@inheritDoc IMessageRelay.connected}
	 */
	public get connected(): boolean {
		return this.backgroundServiceConnection !== undefined;
	}

	/**
	 * {@inheritDoc IMessageRelay.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor() {
		super();

		// Immediately attempt to connect to the background service connection.
		this.connect();
	}

	/**
	 * {@inheritDoc IMessageRelay.connect}
	 */
	public connect(): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		if (this._connected) {
			throw new Error(formatForLogging("The message relay is already connected."));
		}

		console.log(formatForLogging("Connecting to Background script..."));

		// Create a connection to the background page
		this.backgroundServiceConnection = chrome.runtime.connect({
			name: "Background Script",
		});

		// Relay the tab ID to the background service worker.
		const initMessage: DevToolsInitMessage = {
			source: devtoolsMessageSource,
			type: devToolsInitMessageType,
			data: {
				tabId: chrome.devtools.inspectedWindow.tabId,
			},
		};
		postMessageToPort(initMessage, this.backgroundServiceConnection, messageLoggingOptions);

		// Bind listeners
		this.backgroundServiceConnection.onMessage.addListener(this.backgroundMessageHandler);
		this.backgroundServiceConnection.onDisconnect.addListener(this.disconnect);
	}

	/**
	 * Post message to Background Script.
	 */
	public postMessage(message: IDebuggerMessage): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		if (!this._connected) {
			throw new Error(
				formatForLogging("The message relay is not connected. Cannot post message."),
			);
		}

		if (this.backgroundServiceConnection === undefined) {
			throw new Error(
				formatForLogging(
					"The message relay is marked as `connected`, but the background service port is not defined. This should not be possible.",
				),
			);
		}

		postMessageToPort(message, this.backgroundServiceConnection, messageLoggingOptions);
	}

	/**
	 * Disconnects from the background service.
	 */
	private disconnect(): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		this.backgroundServiceConnection?.onMessage.removeListener(this.backgroundMessageHandler);
		this.backgroundServiceConnection = undefined;
		this._connected = false;
		this.emit("disconnected");
	}

	public dispose(): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		this.disconnect();
		this._disposed = true;
	}
}
