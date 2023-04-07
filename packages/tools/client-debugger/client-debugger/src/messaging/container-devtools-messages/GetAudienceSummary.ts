/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link GetAudienceSummary.Message}.
 *
 * @public
 */
export namespace GetAudienceSummary {
	/**
	 * {@link GetAudienceSummary.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "GET_AUDIENCE_SUMMARY";

	/**
	 * Message data format used by {@link GetAudienceSummary.Message}.
	 *
	 * @public
	 */
	export type MessageData = HasContainerId;

	/**
	 * Inbound message requesting audience data from the Container with the specified ID.
	 * Will result in a {@link AudienceSummary.Message } being posted.
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
	 * Creates a {@link GetAudienceSummary.Message} from the provided {@link GetAudienceSummary.MessageData}.
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
