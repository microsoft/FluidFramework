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
 * @internal
 */
export namespace ContainerDevtoolsFeatures {
	/**
	 * {@link ContainerDevtoolsFeatures.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "CONTAINER_DEVTOOLS_FEATURES";

	/**
	 * Message data format used by {@link ContainerDevtoolsFeatures.Message}.
	 *
	 * @internal
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * {@inheritDoc ContainerDevtoolsFeatureFlags}
		 */
		features: ContainerDevtoolsFeatureFlags;
	}

	/**
	 * Outbound message containing the set of features supported by the Container-level Devtools instance associated
	 * with the specified {@link HasContainerId.containerId}.
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
	 * Creates a {@link ContainerDevtoolsFeatures.Message} from the provided {@link ContainerDevtoolsFeatures.MessageData}.
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
