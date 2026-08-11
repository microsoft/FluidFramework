/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { ConnectionStateChangeLogEntry } from "../../Logs.js";
import type { IDevtoolsMessage } from "../Messages.js";

/**
 * Encapsulates types and logic related to {@link ContainerStateHistory.Message}.
 *
 * @internal
 */
export namespace ContainerStateHistory {
	/**
	 * {@link ContainerStateHistory.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CONTAINER_STATE_HISTORY";

	/**
	 * Message data format used by {@link ContainerStateHistory.Message}.
	 *
	 * @internal
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
	 * @internal
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
	 * @internal
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
