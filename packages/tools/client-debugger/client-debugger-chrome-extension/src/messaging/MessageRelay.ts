/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IDebuggerMessage } from "@fluid-tools/client-debugger";

/**
 * Events emitted by {@link IMessageReceiver}.
 *
 * @internal
 */
export interface IMessageReceiverEvents<TMessage extends IDebuggerMessage = IDebuggerMessage>
	extends IEvent {
	/**
	 * Emitted when the {@link IFluidClientDebugger} itself has been disposed.
	 *
	 * @see {@link IFluidClientDebugger.dispose}
	 */
	(event: "message", listener: (message: TMessage) => void);
}

/**
 * A message receiver for {@link IDebuggerMessage}s.
 */
export interface IMessageReceiver<TMessage extends IDebuggerMessage = IDebuggerMessage>
	extends IEventProvider<IMessageReceiverEvents<TMessage>> {
	/**
	 * Type-safe override of {@link chrome.runtime.Port.onMessage}.
	 *
	 * @override
	 */
	onMessage: chrome.events.Event<(message: TMessage, source: IMessageSender<TMessage>) => void>;
}

/**
 * A message sender for {@link IDebuggerMessage}s.
 */
export interface IMessageSender<TMessage extends IDebuggerMessage = IDebuggerMessage> {
	/**
	 * Type-safe override of {@link chrome.runtime.Port.postMessage}.
	 *
	 * @override
	 */
	postMessage: (message: TMessage) => void;
}

/**
 * TODO: is this needed?
 */
export interface IMessageRelay<
	TSend extends IDebuggerMessage = IDebuggerMessage,
	TReceive extends IDebuggerMessage = IDebuggerMessage,
> extends IMessageReceiver<TReceive>,
		IMessageSender<TSend> {}
