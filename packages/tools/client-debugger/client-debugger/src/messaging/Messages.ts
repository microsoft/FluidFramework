/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Message structure expected for window event listeners used by the Fluid Client Debugger.
 *
 * @public
 */
export interface IDebuggerMessage<TData = unknown> {
	/**
	 * Identifies the source of the message.
	 * Can be used to filter the messages being listened to / accepted.
	 *
	 * @remarks
	 *
	 * All messages sent by this library will have the same `source`: {@link debuggerMessageSource}.
	 * Listeners that only want to accept messages coming from this library can filter to those with
	 * a matching source.
	 */
	source: string;

	/**
	 * The type of message being sent.
	 * Informs the action that needs to be taken, and the form that the {@link IDebuggerMessage.data} will take.
	 */
	type: string;

	/**
	 * Message payload.
	 * The type of data is informed by the {@link IDebuggerMessage."type"}.
	 */
	data: TData;
}
