/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Structure of a message used for communication from/to the Fluid Client Debugger.
 *
 * @public
 */
export interface IDevtoolsMessage<TData = unknown> {
	/**
	 * The type of message being sent.
	 * Informs the action that needs to be taken, and the form that the {@link IDevtoolsMessage.data} will take.
	 */
	type: string;

	/**
	 * Message payload.
	 * The type of data is informed by the {@link IDevtoolsMessage."type"}.
	 */
	data: TData;
}

/**
 * Message structure expected for window event listeners used by the Fluid Client Debugger.
 *
 * @public
 */
export interface ISourcedDevtoolsMessage<TData = unknown> extends IDevtoolsMessage<TData> {
	/**
	 * Identifies the source of the message.
	 * Can be used to filter the messages being listened to / accepted.
	 * Message relays are responsible for setting this; no need to set it when creating messages.
	 *
	 * @remarks
	 *
	 * All messages sent by this library will have the same `source`: {@link devtoolsMessageSource}.
	 * Listeners that only want to accept messages coming from this library can filter to those with
	 * a matching source.
	 *
	 * Consumers are encouraged to use a single `source` for all messages they send to this library.
	 * This will help the system differentiate messages it has received from different sources for
	 * the purpose of logging, etc.
	 */
	source: string;
}
