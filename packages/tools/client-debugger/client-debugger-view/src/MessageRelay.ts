/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IBaseDebuggerMessage,
	IDebuggerMessage,
	IMessageRelay,
	IMessageRelayEvents,
	isDebuggerMessage,
} from "@fluid-tools/client-debugger";

/**
 * Message relay for communicating with the Background Script.
 *
 * @remarks
 *
 * We use this class to manage our connection from the Devtools Script to the Background Script, such that we can
 * provide it to our internal library of shared React components and allow them to communicate with external services
 * without needing to be aware of what endpoint they're communicating with.
 *
 * @privateRemarks
 *
 * TODO: This implementation is brittle in a number of ways, which should be addressed before we publish the extension:
 *
 * 1. After establishing the connection with the background service, we send the initialization message that informs
 * the background script of the devtools extension / tab relationship. If that message fails to be processed for any
 * reason, subsequent messages sent from the devtools script will not be correctly forwarded. We should utilize a proper
 * handshake mechanism for the initialization process, and any other critical messages.
 *
 * 2. We don't currently recover if the background service is disconnected for any reason. Generally speaking, the
 * background script's lifetime should outlive the devtools script, but there may be cases where the connection is
 * broken and we could theoretically recover from it. We'll want to see how problematic this really is before attempting
 * to solve it, but it may require something like a message queue so we can queue up messages while we attempt to
 * reconnect, and send them (*in order*, as ordering may be important in some cases) once we have reconnected. For now,
 * we simply throw if the background service disconnects (fail-fast).
 */
export class MessageRelay extends TypedEventEmitter<IMessageRelayEvents> implements IMessageRelay {
	public constructor(private readonly messageSource: string) {
		super();

		console.log("Instantiating MessageRelay...");

		// Bind listeners
		globalThis.addEventListener("message", this.onWindowMessage);
	}

	/**
	 * Post message to the FluidDebugger which lives in the same window we are.
	 */
	public postMessage(message: IBaseDebuggerMessage): void {
		const sourcedMessage: IDebuggerMessage = message as IDebuggerMessage;
		sourcedMessage.source = this.messageSource;
		globalThis.postMessage(sourcedMessage, "*"); // TODO: verify target is okay
	}

	/**
	 * Handler for incoming messages from the window object.
	 * Messages are forwarded on to subscribers for valid {@link IDebuggerMessage}s from the expected source.
	 */
	private readonly onWindowMessage = (event: MessageEvent<Partial<IDebuggerMessage>>): void => {
		if (isDebuggerMessage(event.data)) {
			// Forward incoming message onto subscribers.
			// TODO: validate source
			this.emit("message", event.data);
		}
	};
}
