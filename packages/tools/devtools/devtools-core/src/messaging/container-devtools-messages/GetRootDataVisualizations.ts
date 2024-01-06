/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type HasContainerKey } from "../../CommonInterfaces";
import { type IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetRootDataVisualizations.Message}.
 *
 * @internal
 */
export namespace GetRootDataVisualizations {
	/**
	 * {@link GetRootDataVisualizations.Message} {@link IDevtoolsMessage."type"}.
	 *
	 */
	export const MessageType = "GET_ROOT_DATA_VISUALIZATIONS";

	/**
	 * Message data format used by {@link GetRootDataVisualizations.Message}.
	 *
	 */
	export type MessageData = HasContainerKey;

	/**
	 * Inbound message requesting visualizations for the root DDS data tracked by the
	 * devtools instance associated with the specified {@link ContainerKey}.
	 *
	 * Will result in the {@link RootDataVisualizations.Message} message being posted.
	 *
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link GetRootDataVisualizations.Message} from the provided {@link GetRootDataVisualizations.MessageData}.
	 *
	 */
	export function createMessage(data: MessageData): Message {
		return {
			data,
			type: MessageType,
		};
	}
}
