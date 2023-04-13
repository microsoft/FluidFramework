/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetRootDataVisualizations.Message}.
 *
 * @public
 */
export namespace GetRootDataVisualizations {
	/**
	 * {@link GetRootDataVisualizations.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_ROOT_DATA_VISUALIZATIONS";

	/**
	 * Message data format used by {@link GetRootDataVisualizations.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting visualizations for the root DDS data tracked by the
	 * debugger associated with the specified Container ID.
	 *
	 * Will result in the {@link RootDataVisualizations.Message} message being posted.
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
	 * Creates a {@link GetRootDataVisualizations.Message} from the provided {@link GetRootDataVisualizations.MessageData}.
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
