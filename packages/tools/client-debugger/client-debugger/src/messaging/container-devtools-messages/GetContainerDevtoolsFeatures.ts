/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetContainerDevtoolsFeatures.Message}.
 *
 * @public
 */
export namespace GetContainerDevtoolsFeatures {
	/**
	 * {@link GetContainerDevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_CONTAINER_DEVTOOLS_FEATURES";

	/**
	 * Message data format used by {@link ContainerDevtoolsFeatures.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting the set of features supported by the {@link ContainerDevtools} instance
	 * corresponding to the provided {@link HasContainerId.containerId}.
	 *
	 * Will result in the {@link ContainerDevtoolsFeatures.Message} message being posted.
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
	 * Creates a {@link ContainerDevtoolsFeatures.Message} from the provided
	 * {@link ContainerDevtoolsFeatures.MessageData}.
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
