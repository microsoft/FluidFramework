/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IDevtoolsMessage,
	ISourcedDevtoolsMessage,
	IMessageRelay,
	IMessageRelayEvents,
	isDebuggerMessage,
	devtoolsMessageSource,
} from "@fluid-tools/client-debugger";

/**
 * Message relay used by a debugger view rendered in the same page as the application to communicate with the
 * {@link @fluid-tools/client-debuger#DebuggerRegistry}.
 *
 * @remarks
 *
 * While a debugger view rendered in the same page as the application could technically communicate with the
 * {@link @fluid-tools/client-debuger#DebuggerRegistry} directly, we put this abstraction in the middle to match the
 * way that a debugger view rendered outside the context of the application (e.g. the browser's DevTools panel) has
 * to communicate with the debugger registry.
 * This ensures that we don't "abuse" the power of local interaction to do things that might not be possible (or need
 * to be done differently) with a message passing mechanism that crosses the boundary of the window.
 */
export class WindowMessageRelay
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	public constructor(
		/**
		 * All messages sent through the returned instance's {@link WindowMessageRelay.postMessage}
		 * method will get this value written to their 'source' property.
		 * @see {@link @fluid-tools/client-debugger#ISourcedDevtoolsMessage}
		 */
		private readonly messageSource: string,
	) {
		super();

		console.log("Instantiating MessageRelay...");

		// Bind listeners
		globalThis.addEventListener("message", this.onWindowMessage);
	}

	/**
	 * Post message to the FluidDebugger which lives in the same window we are.
	 */
	public postMessage(message: IDevtoolsMessage): void {
		const sourcedMessage: ISourcedDevtoolsMessage = {
			...message,
			source: this.messageSource,
		};
		globalThis.postMessage(sourcedMessage, "*");
	}

	/**
	 * Handler for incoming messages from the window object.
	 * Messages are forwarded on to subscribers for valid {@link ISourcedDevtoolsMessage}s from the expected source.
	 */
	private readonly onWindowMessage = (
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void => {
		const message = event.data;
		if (isDebuggerMessage(message) && message.source === devtoolsMessageSource) {
			// Forward incoming message onto subscribers.
			this.emit("message", message);
		}
	};
}
