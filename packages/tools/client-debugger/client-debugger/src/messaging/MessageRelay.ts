/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IDebuggerMessage, ISourcedDebuggerMessage } from "./Messages";

/**
 * Events emitted by {@link IMessageRelay}.
 *
 * @internal
 */
export interface IMessageRelayEvents<
	TMessage extends ISourcedDebuggerMessage = ISourcedDebuggerMessage,
> extends IEvent {
	/**
	 * Emitted when a message is received from the external sender.
	 */
	(event: "message", listener: (message: TMessage) => void);
}

/**
 * Manages relaying messages between the consumer of this interface, and some external message sender/receiver.
 *
 * @internal
 */
export interface IMessageRelay<
	TSend extends IDebuggerMessage = IDebuggerMessage,
	TReceive extends ISourcedDebuggerMessage = ISourcedDebuggerMessage,
> extends IEventProvider<IMessageRelayEvents<TReceive>> {
	/**
	 * Posts the provided message to external recipient.
	 */
	postMessage: (message: TSend) => void;
}
