/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IDevtoolsMessage, ISourcedDevtoolsMessage } from "./Messages";

/**
 * Events emitted by {@link IMessageRelay}.
 *
 * @internal
 */
export interface IMessageRelayEvents<
	TMessage extends ISourcedDevtoolsMessage = ISourcedDevtoolsMessage,
> extends IEvent {
	/**
	 * Emitted when a message is received from the external sender.
	 */
	(event: "message", listener: (message: TMessage) => void);
}

/**
 * Manages relaying messages between the consumer of this interface, and some external message sender/receiver.
 *
 * @remarks
 *
 * To send a message **to** the external recipient, call {@link IMessageRelay.postMessage}.
 *
 * To be notified when a message is received **from** the external sender, subscribe to the "message" event
 * via {@link @fluidframework/common-definitions#IEventProvider.on}.
 *
 * @internal
 */
export interface IMessageRelay<
	TSend extends IDevtoolsMessage = IDevtoolsMessage,
	TReceive extends ISourcedDevtoolsMessage = ISourcedDevtoolsMessage,
> extends IEventProvider<IMessageRelayEvents<TReceive>> {
	/**
	 * Posts the provided message to external recipient.
	 */
	postMessage<TPost extends TSend>(message: TPost): void;
}
