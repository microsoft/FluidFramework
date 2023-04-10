/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link CloseContainer.Message}.
 *
 * @public
 */
export namespace CloseContainer {
	/**
	 * {@link CloseContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "CLOSE_CONTAINER";

	/**
	 * Message data format used by {@link CloseContainer.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting that the Container associated with the specified ID be closed.
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
	 * Creates a {@link CloseContainer.Message} from the provided {@link CloseContainer.MessageData}.
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
