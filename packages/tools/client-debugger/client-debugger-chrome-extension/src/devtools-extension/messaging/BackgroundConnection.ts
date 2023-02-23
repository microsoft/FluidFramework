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

import { IMessageReceiverEvents, IMessageRelay, TypedPortConnection } from "../../messaging";
import {
	devToolsInitAcknowledgementType,
	DevToolsInitMessage,
	devToolsInitMessageType,
} from "./Messages";
import { devtoolsMessageSource } from "./Constants";
import { postMessageToPort } from "./Utilities";

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
 * Message relay for communicating with the Background Script.
 */
export class BackgroundConnection
	extends TypedEventEmitter<IMessageReceiverEvents>
	implements IMessageRelay
{
	/**
	 * Port connection to the Background Script
	 */
	private backgroundScriptConnection: TypedPortConnection | undefined;

	/**
	 * Handler for incoming messages from {@link backgroundScriptConnection}.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private readonly backgroundMessageHandler = (message: Partial<IDebuggerMessage>): boolean => {
		if (!isDebuggerMessage(message)) {
			return false;
		}

		if (message.type === devToolsInitAcknowledgementType) {
			console.log(formatForLogging("Background initialization acknowledged."));
			return true;
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

	public constructor() {
		super();
		this.initializeBackgroundServiceConnection();
	}

	private initializeBackgroundServiceConnection(): void {
		console.log(formatForLogging("Connecting to Background script..."));

		// Create a connection to the background page
		this.backgroundScriptConnection = chrome.runtime.connect({
			name: "devtools-page",
		});

		// Relay the tab ID to the background service worker.
		const initMessage: DevToolsInitMessage = {
			source: devtoolsMessageSource,
			type: devToolsInitMessageType,
			data: {
				tabId: chrome.devtools.inspectedWindow.tabId,
			},
		};
		// postMessageToRuntime(initMessage, messageLoggingOptions);
		postMessageToPort(initMessage, this.backgroundScriptConnection, messageLoggingOptions);

		// Bind listeners
		this.backgroundScriptConnection.onMessage.addListener(this.backgroundMessageHandler);

		// If we are disconnected from the service, immediately regenerate connection.
		// TODO: is this correct? Do we need to re-connect on demand instead?
		this.backgroundScriptConnection.onDisconnect.addListener(
			this.initializeBackgroundServiceConnection.bind(this),
		);
	}

	/**
	 * Post message to Background Script.
	 */
	public postMessage(message: IDebuggerMessage): void {
		if (this.backgroundScriptConnection === undefined) {
			throw new Error(
				formatForLogging(
					"Background Script connection is undefined. This should not be possible.",
				),
			);
		}

		// postMessageToRuntime(message, messageLoggingOptions);
		postMessageToPort(message, this.backgroundScriptConnection, messageLoggingOptions);
	}
}
