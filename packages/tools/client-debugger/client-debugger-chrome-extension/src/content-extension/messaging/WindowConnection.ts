/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IDebuggerMessage,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessageToWindow,
} from "@fluid-tools/client-debugger";

import { IMessageReceiverEvents, IMessageRelay } from "../../messaging";

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
	extends TypedEventEmitter<IMessageReceiverEvents>
	implements IMessageRelay
{
	/**
	 * Handler for incoming messages from {@link backgroundScriptConnection}.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private readonly messageRelayHandler = (
		event: MessageEvent<Partial<IDebuggerMessage>>,
	): boolean => {
		const message = event.data;

		// Forward incoming message onto subscribers if it is one of ours.
		// TODO: validate source
		if (isDebuggerMessage(message)) {
			console.log(
				formatForLogging(`Relaying "${message.type}" message from Window to Extension:`),
				message,
			);
			return this.emit("message", message);
		}
		return false;
	};

	public constructor() {
		super();

		// Bind listeners
		globalThis.addEventListener("message", this.messageRelayHandler);
	}

	/**
	 * {@inheritDoc IMessageRelay.postMessage}
	 */
	public postMessage(message: IDebuggerMessage): void {
		postMessageToWindow(message, messageLoggingOptions);
	}
}
