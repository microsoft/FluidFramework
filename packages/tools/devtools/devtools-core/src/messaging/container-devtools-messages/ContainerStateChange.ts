/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey } from "../../CommonInterfaces.js";
import type { ContainerStateMetadata } from "../../ContainerMetadata.js";
import type { IDevtoolsMessage } from "../Messages.js";

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
	export interface MessageData extends HasContainerKey {
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
