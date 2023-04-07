/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerId } from "../../CommonInterfaces";
import { AudienceChangeLogEntry } from "../../Logs";
import { AudienceClientMetadata } from "../../AudienceMetadata";
import { IDebuggerMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link AudienceSummary.Message}.
 *
 * @public
 */
export namespace AudienceSummary {
	/**
	 * {@link AudienceSummary.Message} {@link IDebuggerMessage."type"}.
	 *
	 * @public
	 */
	export const MessageType = "AUDIENCE_SUMMARY";

	/**
	 * Message data format used by {@link AudienceSummary.Message}.
	 *
	 * @public
	 */
	export interface MessageData extends HasContainerId {
		/**
		 * Id of the client connected to the container
		 */
		clientId: string | undefined;

		/**
		 * Metadata of the current Audience state.
		 */
		audienceState: AudienceClientMetadata[];

		/**
		 * Connection history of members to the container
		 */
		audienceHistory: readonly AudienceChangeLogEntry[];
	}

	/**
	 * Outbound message containing a summary of the Container's Audience info.
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
	 * Creates a {@link AudienceSummary.Message} from the provided {@link AudienceSummary.MessageData}.
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
