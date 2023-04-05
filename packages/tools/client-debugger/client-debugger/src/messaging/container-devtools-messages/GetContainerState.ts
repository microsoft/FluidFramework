/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../ContainerDevtoolsMessages";
import { IDebuggerMessage } from "../Messages";

/**
 * TODO
 *
 * @public
 */
export namespace GetContainerState {
	/**
	 * {@link GetContainerState.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_CONTAINER_STATE";

	/**
	 * Message data format used by {@link GetContainerState.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
	 *
	 * Will result in the {@link ContainerStateChangeMessage} message being posted.
	 *
	 * @public
	 */
	export interface Message extends IDebuggerMessage<HasContainerId> {
		/**
		 * {@inheritDoc IDebuggerMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetContainerState.Message} from the provided {@link GetContainerState.MessageData}.
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
