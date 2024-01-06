/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type HasContainerKey } from "../../CommonInterfaces";
import { type IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetContainerState.Message}.
 *
 * @internal
 */
export namespace GetContainerState {
	/**
	 * {@link GetContainerState.Message} {@link IDevtoolsMessage."type"}.
	 *
	 */
	export const MessageType = "GET_CONTAINER_STATE";

	/**
	 * Message data format used by {@link GetContainerState.Message}.
	 *
	 */
	export type MessageData = HasContainerKey;

	/**
	 * Inbound message requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
	 *
	 * Will result in the {@link ContainerStateChange.Message} message being posted.
	 *
	 */
	export interface Message extends IDevtoolsMessage<HasContainerKey> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetContainerState.Message} from the provided {@link GetContainerState.MessageData}.
	 *
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
