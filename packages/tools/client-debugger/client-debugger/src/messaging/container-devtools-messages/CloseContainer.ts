/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link CloseContainer.Message}.
 *
 * @public
 */
export namespace CloseContainer {
	/**
	 * {@link CloseContainer.Message} {@link IDebuggerMessage."type"}.
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
	export interface Message extends IDebuggerMessage<MessageData> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
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
