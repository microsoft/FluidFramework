/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInboundMessage, IOutboundMessage } from "./Messages";

/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 *
 * @privateRemarks TODO: remove from package exports.
 *
 * @internal
 */
export function postWindowMessage<TMessage extends IOutboundMessage>(message: TMessage): void {
	globalThis.postMessage(message, "*"); // TODO: verify target is okay
}

/**
 * Handlers for {@link IInboundMessage}s.
 */
export interface InboundHandlers {
	/**
	 * Mapping from {@link IInboundMessage."type"}s to a handler callback for that message type.
	 * @returns Whether or not the message was actually handled.
	 */
	[type: string]: (message: IInboundMessage) => boolean;
}

/**
 * Console logging options for {@link handleWindowMessage}.
 *
 * @privateRemarks TODO: Introduce better diagnostic logging infra for the entire library
 */
export interface LoggingOptions {
	/**
	 * Context to associate with the log text.
	 * Messages will be logged in the form: `(<context>): <text>`.
	 */
	context?: string;
}

/**
 * Utility function for handling incoming events from the window (globalThis).
 *
 * @param event - The window event containing the message to handle.
 * @param handlers - List of handlers for particular event types.
 * If the incoming event's message type has a corresponding handler callback, that callback will be invoked.
 * Otherwise, this function will no-op.
 */
export function handleWindowMessage(
	event: MessageEvent<IInboundMessage>,
	handlers: InboundHandlers,
	loggingOptions?: LoggingOptions,
): void {
	if ((event.source as unknown) !== globalThis) {
		// Ignore events coming from outside of this window / global context
		return;
	}

	const message = event.data;

	if (message?.type === undefined) {
		return;
	}

	if (handlers[message.type] === undefined) {
		// No handler for this type provided. No-op.
		return;
	}

	const handled = handlers[message.type](message);

	// Only log if the message was actually handled by the recipient.
	if (handled) {
		const loggingPreamble =
			loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
		console.debug(`${loggingPreamble}"${message.type}" message received.`);
	}
}
