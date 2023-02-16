/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "./Messages";

/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 *
 * @internal
 */
export function postMessageToWindow<TMessage extends IDebuggerMessage>(
	message: TMessage,
	loggingOptions?: MessageLoggingOptions,
): void {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
	console.log(`${loggingPreamble}Posting message to the window:`, message); // TODO: console.debug
	globalThis.postMessage(message, "*"); // TODO: verify target is okay
}

/**
 * Handlers for incoming {@link IDebuggerMessage}s.
 *
 * @internal
 */
export interface InboundHandlers {
	/**
	 * Mapping from {@link IDebuggerMessage."type"}s to a handler callback for that message type.
	 * @returns Whether or not the message was actually handled.
	 */
	[type: string]: (message: IDebuggerMessage) => boolean;
}

/**
 * Console logging options for {@link handleIncomingMessage}.
 *
 * @privateRemarks TODO: Introduce better diagnostic logging infra for the entire library
 *
 * @internal
 */
export interface MessageLoggingOptions {
	/**
	 * Context to associate with the log text.
	 * Messages will be logged in the form: `(<context>): <text>`.
	 */
	context?: string;
}

/**
 * Utility function for handling incoming events.
 *
 * @param event - The window event containing the message to handle.
 * @param handlers - List of handlers for particular event types.
 * If the incoming event's message type has a corresponding handler callback, that callback will be invoked.
 * Otherwise, this function will no-op.
 *
 * @internal
 */
export function handleIncomingMessage(
	event: MessageEvent<Partial<IDebuggerMessage>>,
	handlers: InboundHandlers,
	loggingOptions?: MessageLoggingOptions,
): void {
	const message = event.data;

	if (message?.type === undefined) {
		return;
	}

	if (handlers[message.type] === undefined) {
		// No handler for this type provided. No-op.
		return;
	}

	const handled = handlers[message.type](message as IDebuggerMessage);

	// Only log if the message was actually handled by the recipient.
	if (handled) {
		const loggingPreamble =
			loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
		console.log(`${loggingPreamble}"${message.type}" message handled:`, message); // TODO: console.debug
	}
}
