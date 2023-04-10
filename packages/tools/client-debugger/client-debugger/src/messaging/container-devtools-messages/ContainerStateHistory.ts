/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { ConnectionStateChangeLogEntry } from "../../Logs";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerStateHistory.Message}.
 *
 * @public
 */
export namespace ContainerStateHistory {
	/**
	 * {@link ContainerStateHistory.Message} {@link IDebuggerMessage."type"}.
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
	export interface Message extends IDebuggerMessage<MessageData> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
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
