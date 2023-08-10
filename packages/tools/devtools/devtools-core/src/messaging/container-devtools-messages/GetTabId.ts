/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISourcedDevtoolsMessage } from "../Messages";
import { testMessageSource } from "../Constants"

/**
 * Encapsulates types and logic related to {@link GetTabId.Message}.
 *
 * @internal
 */
export namespace GetTabId {
	/**
	 * {@link GetTabId.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "GET_TAB_ID";

	/**
	 * Message data format used by {@link GetTabId.Message}.
	 *
	 * @internal
	 */
	export type MessageData = string;

	/**
	 * Inbound message requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
	 *
	 * Will result in the {@link ContainerStateChange.Message} message being posted.
	 *
	 * @internal
	 */
	export interface Message extends ISourcedDevtoolsMessage {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetTabId.Message} from the provided {@link GetTabId.MessageData}.
	 *
	 * @internal
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			source: testMessageSource, 
			type: MessageType,
		};
	}
}
