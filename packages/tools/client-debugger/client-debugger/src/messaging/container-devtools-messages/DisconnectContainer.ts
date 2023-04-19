/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link DisconnectContainer.Message}.
 *
 * @public
 */
export namespace DisconnectContainer {
	/**
	 * {@link DisconnectContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "DISCONNECT_CONTAINER";

	/**
	 * Message data format used by {@link DisconnectContainer.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting that the Container associated with the specified ID be disconnected (if currently connected).
	 *
	 * @public
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
	 * @public
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
