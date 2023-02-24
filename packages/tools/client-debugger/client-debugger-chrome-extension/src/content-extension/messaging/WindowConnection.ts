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
 * Error logged when consumer attempts to access {@link WindowConnection} members after it
 * has been disposed.
 */
const accessDisposedError = formatForLogging("The message relay was previously disposed.");

/**
 * Message relay for communicating with the Window from the Content Script.
 */
export class WindowConnection
	extends TypedEventEmitter<IMessageRelayEvents>
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

	/**
	 * {@inheritDoc IMessageRelay.connected}
	 *
	 * @privateRemarks Always true after construction.
	 */
	public get connected(): boolean {
		return true;
	}

	/**
	 * Private backing data for {@link BackgroundConnection.disposed}.
	 */
	private _disposed: boolean = false;

	/**
	 * {@inheritDoc IMessageRelay.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor() {
		super();

		// Bind listeners
		globalThis.addEventListener("message", this.messageRelayHandler);
	}

	/**
	 * {@inheritDoc IMessageRelay.connect}
	 *
	 * @privateRemarks Unconditionally throws, since connection is established upon construction.
	 */
	public connect(): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		throw new Error("Window Connection is already connected.");
	}

	/**
	 * {@inheritDoc IMessageRelay.postMessage}
	 */
	public postMessage(message: IDebuggerMessage): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		postMessageToWindow(message, messageLoggingOptions);
	}

	public dispose(): void {
		if (this._disposed) {
			throw new Error(accessDisposedError);
		}

		globalThis.removeEventListener("message", this.messageRelayHandler);
		this._disposed = true;
	}
}
