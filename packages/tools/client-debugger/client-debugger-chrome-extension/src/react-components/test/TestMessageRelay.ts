/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "@fluid-tools/client-debugger";
import { delay, TypedEventEmitter } from "@fluidframework/common-utils";
import { IMessageRelay, IMessageRelayEvents } from "../../messaging";

/**
 * Mock {@link IMessageRelay} implementation for testing.
 *
 * @remarks
 *
 * Consumers must provide the appropriate `messageHandler` for their test scenario.
 *
 * When handling an incoming message, this type will introduce an artificial delay before responding,
 * to simulate more realistic scenarios.
 */
export class TestMessageRelay
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	/**
	 * Handles the incoming message by optionally returning a response message.
	 */
	private readonly messageHandler: (message: IDebuggerMessage) => IDebuggerMessage | undefined;

	public constructor(
		messageHandler: (message: IDebuggerMessage) => IDebuggerMessage | undefined,
	) {
		super();
		this.messageHandler = messageHandler;
	}

	public postMessage(message: IDebuggerMessage): void {
		this.onMessage(message).catch((error) => {
			console.error(error);
			throw error;
		});
	}

	private readonly onMessage = async (message: IDebuggerMessage): Promise<void> => {
		// Simulate messaging delay before handling the message / sending the response
		await delay(500);

		const response = this.messageHandler(message);
		if (response !== undefined) {
			this.emit("message", response);
		}
	};
}
