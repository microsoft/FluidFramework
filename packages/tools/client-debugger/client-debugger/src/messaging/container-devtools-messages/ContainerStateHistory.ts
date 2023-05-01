/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { ConnectionStateChangeLogEntry } from "../../Logs";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerStateHistory.Message}.
 *
 * @public
 */
export namespace ContainerStateHistory {
	/**
	 * {@link ContainerStateHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "CONTAINER_STATE_HISTORY";

	/**
	 * Message data format used by {@link ContainerStateHistory.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * The Container's connection state history.
		 */
		history: ConnectionStateChangeLogEntry[];
	}

	/**
	 * Outbound message containing the associated Container's state history.
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
	 * Creates a {@link ContainerStateHistory.Message} from the provided {@link ContainerStateHistory.MessageData}.
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
