/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { ContainerStateMetadata } from "../../ContainerMetadata";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerStateChange.Message}.
 *
 * @public
 */
export namespace ContainerStateChange {
	/**
	 * {@link ContainerStateChange.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "CONTAINER_STATE_CHANGE";

	/**
	 * Message data format used by {@link ContainerStateChange.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * Updated Container state metadata.
		 */
		containerState: ContainerStateMetadata;

		// TODO: change logs
	}

	/**
	 * Outbound message indicating a state change within a Container.
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
	 * Creates a {@link ContainerStateChange.Message} from the provided {@link ContainerStateChange.MessageData}.
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
