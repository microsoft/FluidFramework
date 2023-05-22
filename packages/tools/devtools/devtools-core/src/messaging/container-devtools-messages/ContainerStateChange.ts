/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { ContainerStateMetadata } from "../../ContainerMetadata";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerStateChange.Message}.
 *
 * @internal
 */
export namespace ContainerStateChange {
	/**
	 * {@link ContainerStateChange.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CONTAINER_STATE_CHANGE";

	/**
	 * Message data format used by {@link ContainerStateChange.Message}.
	 *
	 * @internal
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
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link ContainerStateChange.Message} from the provided {@link ContainerStateChange.MessageData}.
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
