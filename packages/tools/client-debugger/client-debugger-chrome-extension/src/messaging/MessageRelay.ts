/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IDebuggerMessage } from "@fluid-tools/client-debugger";

/**
 * Events emitted by {@link IMessageRelay}.
 *
 * @internal
 */
export interface IMessageRelayEvents<TMessage extends IDebuggerMessage = IDebuggerMessage>
	extends IEvent {
	/**
	 * Emitted when a message is received from the external sender.
	 */
	(event: "message", listener: (message: TMessage) => void);
}

/**
 * Manages relaying messages between the consumer of this interface, and some external message sender/receiver.
 */
export interface IMessageRelay<
	TSend extends IDebuggerMessage = IDebuggerMessage,
	TReceive extends IDebuggerMessage = IDebuggerMessage,
> extends IEventProvider<IMessageRelayEvents<TReceive>> {
	/**
	 * Posts the provided message to external recipient.
	 *
	 * @remarks Must only be called when {@link IMessageRelay.connected} is `true`.
	 */
	postMessage: (message: TSend) => void;
}
