/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";

/**
 * Relays the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function relayMessageToWindow<TMessage extends IDebuggerMessage>(
	message: TMessage,
	messageSource: string,
	loggingOptions?: MessageLoggingOptions,
): void {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
	console.log(
		`${loggingPreamble}Relaying message from "${messageSource}" to the window:`,
		message,
	); // TODO: console.debug
	window.postMessage(message, "*"); // TODO: verify target is okay
}

/**
 * Relays the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function relayMessageToPort<TMessage extends IDebuggerMessage>(
	message: TMessage,
	messageSource: string,
	targetPort: chrome.runtime.Port,
	loggingOptions?: MessageLoggingOptions,
): void {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
	console.log(
		`${loggingPreamble}Relaying message from "${messageSource}" to port "${targetPort}":`,
		message,
	); // TODO: console.debug
	targetPort.postMessage(message);
}

/**
 * Posts the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function postMessageToPort<TMessage extends IDebuggerMessage>(
	message: TMessage,
	targetPort: chrome.runtime.Port,
	loggingOptions?: MessageLoggingOptions,
): void {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `(${loggingOptions.context}): `;
	console.log(`${loggingPreamble}Posting message to port "${targetPort}":`, message); // TODO: console.debug
	targetPort.postMessage(message);
}

/**
 * Validates some incoming message to ensure it is a valid {@link IDebuggerMessage}.
 */
export function isValidDebuggerMessage(
	message: Partial<IDebuggerMessage>,
): message is IDebuggerMessage {
	return message.source !== undefined && message.type !== undefined;
}
