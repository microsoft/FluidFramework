/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link DisconnectContainer.Message}.
 *
 * @internal
 */
export namespace DisconnectContainer {
	/**
	 * {@link DisconnectContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "DISCONNECT_CONTAINER";

	/**
	 * Message data format used by {@link DisconnectContainer.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey;

	/**
	 * Inbound message requesting that the Container associated with the specified ID be disconnected (if currently connected).
	 *
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link DisconnectContainer.Message} from the provided {@link DisconnectContainer.MessageData}.
	 *
	 * @internal
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
