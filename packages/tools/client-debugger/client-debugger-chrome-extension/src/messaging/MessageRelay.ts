/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
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

	/**
	 * Emitted when the relay has established a connection to the external sender/receiver.
	 *
	 * @remarks Corresponds with {@link IMessageRelay.connected} transitioning from `false` to `true`.
	 */
	(event: "connected", listener: () => void);

	/**
	 * Emitted when the relay loses its connection to the external sender/receiver.
	 *
	 * @remarks Corresponds with {@link IMessageRelay.connected} transitioning from `true` to `false`.
	 */
	(event: "disconnected", listener: () => void);
}

/**
 * Manages relaying messages between the consumer of this interface, and some external message sender/receiver.
 */
export interface IMessageRelay<
	TSend extends IDebuggerMessage = IDebuggerMessage,
	TReceive extends IDebuggerMessage = IDebuggerMessage,
> extends IEventProvider<IMessageRelayEvents<TReceive>>,
		IDisposable {
	/**
	 * Whether or not the relay has a connection to the external sender/receiver.
	 */
	readonly connected: boolean;

	/**
	 * Attempt to connect to the external sender/receiver.
	 * The "connected" event will be emitted when the connection has been established.
	 *
	 * @remarks Should only be called when {@link IMessageRelay.connected} is `false`.
	 *
	 * @privateRemarks
	 *
	 * TODO: we should attempt to promisify this pattern, so this doesn't return until the
	 * connection has been established.
	 */
	connect(): void;

	/**
	 * Posts the provided message to external recipient.
	 *
	 * @remarks Must only be called when {@link IMessageRelay.connected} is `true`.
	 */
	postMessage: (message: TSend) => void;
}
