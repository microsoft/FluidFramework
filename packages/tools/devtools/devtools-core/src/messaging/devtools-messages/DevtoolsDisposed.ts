/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link DevtoolsDisposed.Message}.
 *
 * @internal
 */
export namespace DevtoolsDisposed {
	/**
	 * {@link DevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DEVTOOLS_DISPOSED";

	/**
	 * Outbound message broadcasting that the devtools instance in the webpage is terminating.
	 *
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<undefined> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link DevtoolsDisposed.Message}.
	 *
	 * @internal
	 */
	export function createMessage(): Message {
		return {
			data: undefined,
			type: MessageType,
		};
	}
}
