/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage, MessageLoggingOptions } from "@fluid-tools/client-debugger";
import { TypedPortConnection } from "../../messaging";

function formatMessageForLogging(text: string, loggingOptions?: MessageLoggingOptions): string {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `${loggingOptions.context}: `;
	return `${loggingPreamble}${text}`;
}

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
	console.log(
		formatMessageForLogging(
			`Relaying message from "${messageSource}" to the window:`,
			loggingOptions,
		),
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
	targetPort: TypedPortConnection<TMessage>,
	loggingOptions?: MessageLoggingOptions,
): void {
	console.log(
		formatMessageForLogging(
			`Relaying message from "${messageSource}" to port "${targetPort.name}":`,
			loggingOptions,
		),
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
	targetPort: TypedPortConnection<TMessage>,
	loggingOptions?: MessageLoggingOptions,
): void {
	console.log(
		formatMessageForLogging(
			`Posting message to port "${targetPort.name ?? "(unnamed)"}":`,
			loggingOptions,
		),
		message,
	); // TODO: console.debug
	targetPort.postMessage(message);
}

/**
 * Relays the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function relayMessageToRuntime<TMessage extends IDebuggerMessage>(
	message: TMessage,
	messageSource: string,
	loggingOptions?: MessageLoggingOptions,
): void {
	console.log(
		formatMessageForLogging(
			`Relaying message from "${messageSource}" to Background Script:`,
			loggingOptions,
		),
		message,
	);
	chrome.runtime.sendMessage(message).then(
		(response) => {
			console.log(
				formatMessageForLogging(
					`Acknowledgement received from Background Script for message:`,
					loggingOptions,
				),
				response,
			);
		},
		(error) => {
			console.error(
				formatMessageForLogging(
					`Encountered an error while relaying message from "${messageSource}" to Background Script`,
					loggingOptions,
				),
				error,
			);
		},
	);
}

/**
 * Posts the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function postMessageToRuntime<TMessage extends IDebuggerMessage>(
	message: TMessage,
	loggingOptions?: MessageLoggingOptions,
): void {
	console.log(
		formatMessageForLogging(`Posting message to Background Script:`, loggingOptions),
		message,
	);
	chrome.runtime.sendMessage(message).then(
		(response) => {
			console.log(
				formatMessageForLogging(
					`Acknowledgement received from Background Script for message:`,
					loggingOptions,
				),
				response,
			);
		},
		(error) => {
			console.error(
				formatMessageForLogging(
					`Encountered an error while posting message to Background Script:`,
					loggingOptions,
				),
				error,
			);
		},
	);
}
