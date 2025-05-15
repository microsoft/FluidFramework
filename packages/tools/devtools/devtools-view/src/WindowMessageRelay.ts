/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type IDevtoolsMessage,
	type IMessageRelay,
	type IMessageRelayEvents,
	type ISourcedDevtoolsMessage,
	devtoolsMessageSource,
	isDevtoolsMessage,
} from "@fluidframework/devtools-core/internal";

/**
 * Message relay used by a devtools view rendered in the same page as the application to communicate with the
 * {@link @fluid-tools/client-debuger#IFluidDevtools}.
 *
 * @remarks
 *
 * While a devtools view rendered in the same page as the application could technically communicate with the
 * {@link @fluid-tools/client-debuger#IFluidDevtools} directly, we put this abstraction in the middle to match the
 * way that a devtools view rendered outside the context of the application (e.g. the browser's DevTools panel) has
 * to communicate with the devtools registry.
 * This ensures that we don't "abuse" the power of local interaction to do things that might not be possible (or need
 * to be done differently) with a message passing mechanism that crosses the boundary of the window.
 *
 * @internal
 */
export class WindowMessageRelay
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	public constructor(
		/**
		 * All messages sent through the returned instance's {@link WindowMessageRelay.postMessage}
		 * method will get this value written to their 'source' property.
		 *
		 * @see {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage}
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
	 * Messages are forwarded on to subscribers for valid {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage}s
	 * from the expected source.
	 */
	private readonly onWindowMessage = (
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void => {
		const message = event.data;
		// console.log("WindowMessageRelay: Received message:", message);
		if (isDevtoolsMessage(message) && message.source === devtoolsMessageSource) {
			// console.log("WindowMessageRelay: Forwarding message to subscribers");
			// Forward incoming message onto subscribers.
			this.emit("message", message);
		}
		// else {
		// 	console.log("WindowMessageRelay: Message not forwarded because:", {
		// 		isDevtoolsMessage: isDevtoolsMessage(message),
		// 		messageSource: message.source,
		// 		expectedSource: devtoolsMessageSource,
		// 	});
		// }
	};
}
