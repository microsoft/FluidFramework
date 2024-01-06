/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type HasContainerKey } from "../../CommonInterfaces";
import { type ConnectionStateChangeLogEntry } from "../../Logs";
import { type IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerStateHistory.Message}.
 *
 * @internal
 */
export namespace ContainerStateHistory {
	/**
	 * {@link ContainerStateHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 */
	export const MessageType = "CONTAINER_STATE_HISTORY";

	/**
	 * Message data format used by {@link ContainerStateHistory.Message}.
	 *
	 */
	export interface MessageData extends HasContainerKey {
		/**
		 * The Container's connection state history.
		 */
		history: ConnectionStateChangeLogEntry[];
	}

	/**
	 * Outbound message containing the associated Container's state history.
	 *
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link ContainerStateHistory.Message} from the provided {@link ContainerStateHistory.MessageData}.
	 *
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
