/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	debuggerMessageSource,
	IDebuggerMessage,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessageToWindow,
} from "@fluid-tools/client-debugger";

import { IMessageRelayEvents, IMessageRelay } from "../../messaging";

/**
 * Context string for logging.
 */
const loggingContext = "EXTENSION(CONTENT_SCRIPT)";

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
 * Message relay for communicating with the Window from the Content Script.
 */
export class WindowConnection
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	public constructor() {
		super();

		// Bind listeners
		globalThis.addEventListener("message", this.onWindowMessageEvent);
	}

	/**
	 * Handler for incoming messages from {@link backgroundScriptConnection}.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private onWindowMessageEvent(event: MessageEvent<Partial<IDebuggerMessage>>): void {
		const message = event.data;

		// Only relay message if it is one of ours, and if the source is the window's debugger
		// (and not a message originating from the extension).
		if (isDebuggerMessage(message) && message.source === debuggerMessageSource) {
			console.log(
				formatForLogging(`Relaying "${message.type}" message from Window to Extension:`),
				message,
			);
			this.emit("message", message);
		}
	}

	/**
	 * {@inheritDoc IMessageRelay.postMessage}
	 */
	public postMessage(message: IDebuggerMessage): void {
		postMessageToWindow(message, messageLoggingOptions);
	}
}
