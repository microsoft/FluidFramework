/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link ConnectContainer.Message}.
 *
 * @internal
 */
export namespace ConnectContainer {
	/**
	 * {@link ConnectContainer.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CONNECT_CONTAINER";

	/**
	 * Message data format used by {@link ConnectContainer.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerKey;

	/**
	 * Inbound message requesting that the Container associated with the specified ID be connected (if currently disconnected).
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
	 * Creates a {@link ConnectContainer.Message} from the provided {@link ConnectContainer.MessageData}.
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
