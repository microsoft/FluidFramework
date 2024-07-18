/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISourcedDevtoolsMessage,
	MessageLoggingOptions,
} from "@fluidframework/devtools-core/internal";

import type { TypedPortConnection } from "./TypedPortConnection.js";

function formatMessageForLogging(
	text: string,
	loggingOptions?: MessageLoggingOptions,
): string {
	const loggingPreamble =
		loggingOptions?.context === undefined ? "" : `${loggingOptions.context}: `;
	return `${loggingPreamble}${text}`;
}

/**
 * Relays the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function relayMessageToPort<TMessage extends ISourcedDevtoolsMessage>(
	message: TMessage,
	messageSource: string,
	targetPort: TypedPortConnection<TMessage>,
	loggingOptions?: MessageLoggingOptions,
): void {
	// TODO: remove loggingOptions once things settle.
	if (loggingOptions !== undefined) {
		console.debug(
			formatMessageForLogging(
				`Relaying message from "${messageSource}" to port "${
					targetPort.name ?? "(unnamed)"
				}":`,
				loggingOptions,
			),
			message,
		);
	}
	targetPort.postMessage(message);
}

/**
 * Posts the provided message to the specified target port.
 *
 * @remarks Thin wrapper to provide some message-wise type-safety, and to inject some automated logging.
 *
 * @internal
 */
export function postMessageToPort<TMessage extends ISourcedDevtoolsMessage>(
	message: TMessage,
	targetPort: TypedPortConnection<TMessage>,
	loggingOptions?: MessageLoggingOptions,
): void {
	// TODO: remove loggingOptions once things settle.
	if (loggingOptions !== undefined) {
		console.debug(
			formatMessageForLogging(
				`Posting message to port "${targetPort.name ?? "(unnamed)"}":`,
				loggingOptions,
			),
			message,
		);
	}
	targetPort.postMessage(message);
}
