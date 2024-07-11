/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link CloseContainer.Message}.
 *
 * @internal
 */
export namespace CloseContainer {
	/**
	 * {@link CloseContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CLOSE_CONTAINER";

	/**
	 * Message data format used by {@link CloseContainer.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey;

	/**
	 * Inbound message requesting that the Container associated with the specified ID be closed.
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
	 * Creates a {@link CloseContainer.Message} from the provided {@link CloseContainer.MessageData}.
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
