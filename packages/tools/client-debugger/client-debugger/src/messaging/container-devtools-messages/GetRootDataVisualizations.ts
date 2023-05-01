/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetRootDataVisualizations.Message}.
 *
 * @internal
 */
export namespace GetRootDataVisualizations {
	/**
	 * {@link GetRootDataVisualizations.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "GET_ROOT_DATA_VISUALIZATIONS";

	/**
	 * Message data format used by {@link GetRootDataVisualizations.Message}.
	 *
	 * @internal
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting visualizations for the root DDS data tracked by the
	 * debugger associated with the specified Container ID.
	 *
	 * Will result in the {@link RootDataVisualizations.Message} message being posted.
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
	 * Creates a {@link GetRootDataVisualizations.Message} from the provided {@link GetRootDataVisualizations.MessageData}.
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
