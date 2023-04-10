/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { ContainerDevtoolsFeatureFlags } from "../../Features";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link ContainerDevtoolsFeatures.Message}.
 *
 * @public
 */
export namespace ContainerDevtoolsFeatures {
	/**
	 * {@link ContainerDevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "CONTAINER_DEVTOOLS_FEATURES";

	/**
	 * Message data format used by {@link ContainerDevtoolsFeatures.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * Describes the set of features supported by the {@link ContainerDevtools} instance associated with the
		 * specified {@link HasContainerId.containerId}.
		 */
		features: ContainerDevtoolsFeatureFlags;
	}

	/**
	 * Outbound message containing the set of features supported by the {@link ContainerDevtools} instance associated
	 * with the specified {@link HasContainerId.containerId}.
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
	 * Creates a {@link ContainerDevtoolsFeatures.Message} from the provided {@link ContainerDevtoolsFeatures.MessageData}.
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
