/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IMessageRelay,
	type IMessageRelayEvents,
	type IDevtoolsMessage,
} from "@fluid-experimental/devtools-core";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

/**
 * Returns a direct response to the provided message.
 *
 * Will return `undefined` if no response message should be emitted.
 */
export type MockRelayMessageHandler = (message: IDevtoolsMessage) => IDevtoolsMessage | undefined;

/**
 * Mock implementation of {@link @fluid-experimental/devtools-core#IMessageRelay} for use in tests.
 *
 * Takes in a message handler that (optionally) directly returns a response message to be emitted.
 */
export class MockMessageRelay
	extends TypedEventEmitter<IMessageRelayEvents>
	implements IMessageRelay
{
	public constructor(
		/**
		 * {@inheritDoc MockMessageHandler}
		 */

		private readonly messageHandler: MockRelayMessageHandler,
	) {
		super();
	}

	/**
	 * {@inheritDoc IMessageRelay.postMessage}
	 */

	public postMessage(message: IDevtoolsMessage): void {
		const response = this.messageHandler(message);
		if (response !== undefined) {
			this.emit("message", response);
		}
	}
}
