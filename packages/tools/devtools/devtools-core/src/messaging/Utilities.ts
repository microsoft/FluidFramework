/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { devtoolsMessageSource } from "./Constants.js";
import type { IDevtoolsMessage, ISourcedDevtoolsMessage } from "./Messages.js";

/**
 * Posts the provided message to the window (globalThis).
 *
 * @param messages - The messages to be posted
 * @param loggingOptions - Settings related to logging to console for troubleshooting.
 * If not passed, this function won't log to console before posting the message.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 */
export function postMessagesToWindow<TMessage extends IDevtoolsMessage>(
	loggingOptions?: MessageLoggingOptions,
	...messages: TMessage[]
): void {
	const messagesWithSource: ISourcedDevtoolsMessage[] = messages.map((message) => ({
		...message,
		source: devtoolsMessageSource,
	}));

	// TODO: remove loggingOptions once things settle.
	// If we need special logic for globalThis.postMessage maybe keep this function, but otherwise maybe remove it too.
	if (loggingOptions !== undefined) {
		const loggingPreamble =
			loggingOptions?.context === undefined ? "" : `${loggingOptions.context}: `;
		console.debug(`${loggingPreamble}Posting messages to the window:`, messagesWithSource);
	}
	for (const message of messagesWithSource) {
		globalThis.postMessage?.(message, "*");
	}
}

/**
 * Handlers for incoming {@link ISourcedDevtoolsMessage}s.
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface InboundHandlers {
	/**
	 * Mapping from {@link IDevtoolsMessage."type"}s to a handler callback for that message type.
	 *
	 * @returns A promise that resolves to a flag indicating if the message was handled (`true`) or not (`false`).
	 */
	[type: string]: (message: ISourcedDevtoolsMessage) => Promise<boolean>;
}

/**
 * Console logging options for {@link handleIncomingWindowMessage}.
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
 * @param loggingOptions - Settings related to logging to console for troubleshooting.
 * If not passed, this function won't log to console after the message has been handled.
 *
 * @internal
 */
export function handleIncomingWindowMessage(
	event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	handlers: InboundHandlers,
	loggingOptions?: MessageLoggingOptions,
): void {
	// TODO: remove loggingOptions once things settle.
	return handleIncomingMessage(event.data, handlers, loggingOptions);
}

/**
 * Utility function for handling incoming events.
 *
 * @param message - The window event containing the message to handle.
 * @param handlers - List of handlers for particular event types.
 * If the incoming event's message type has a corresponding handler callback, that callback will be invoked.
 * Otherwise, this function will no-op.
 * @param loggingOptions - Settings related to logging to console for troubleshooting.
 * If not passed, this function won't log to console after the message has been handled.
 *
 * @internal
 */
export function handleIncomingMessage(
	message: Partial<ISourcedDevtoolsMessage>,
	handlers: InboundHandlers,
	loggingOptions?: MessageLoggingOptions,
): void {
	// TODO: remove loggingOptions once things settle.

	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `${loggingOptions.context}: `;

	if (message === undefined) {
		console.error(`${loggingPreamble} No message provided to handle.`);
		return;
	}

	if (!isDevtoolsMessage(message)) {
		console.debug(`${loggingPreamble} Ignoring non-devtools message.`);
		return;
	}

	const handler = handlers[message.type];
	if (handler === undefined) {
		// No handler for this type provided. No-op.
		console.debug(
			`${loggingPreamble} Ignoring message of type: "${message.type}", for which no handler was provided.`,
		);
		return;
	}

	handler(message).then(
		(wasMessageHandled) => {
			// Only log if the message was actually handled by the recipient.
			if (wasMessageHandled && loggingOptions !== undefined) {
				console.debug(`${loggingPreamble} Message handled.`, message);
			}
		},
		(error) => {
			console.error(`${loggingPreamble} Message could not be handled due to an error:`, error);
		},
	);
}

/**
 * Determines whether the provided event message data is an {@link ISourcedDevtoolsMessage}.
 *
 * @internal
 */
export function isDevtoolsMessage(
	value: Partial<ISourcedDevtoolsMessage>,
): value is ISourcedDevtoolsMessage {
	return typeof value.source === "string" && value.type !== undefined;
}
