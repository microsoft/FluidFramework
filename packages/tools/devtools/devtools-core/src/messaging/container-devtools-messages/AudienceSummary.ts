/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HasContainerKey } from "../../CommonInterfaces";
import { AudienceChangeLogEntry } from "../../Logs";
import { AudienceClientMetadata } from "../../AudienceMetadata";
import { IDevtoolsMessage } from "../Messages";

/**
 * Encapsulates types and logic related to {@link AudienceSummary.Message}.
 *
 * @internal
 */
export namespace AudienceSummary {
	/**
	 * {@link AudienceSummary.Message} {@link IDevtoolsMessage."type"}.
	 *
	 * @internal
	 */
	export const MessageType = "AUDIENCE_SUMMARY";

	/**
	 * Message data format used by {@link AudienceSummary.Message}.
	 *
	 * @internal
	 */
	export interface MessageData extends HasContainerKey {
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
	 * @internal
	 */
	export interface Message extends IDevtoolsMessage<MessageData> {
		/**
		 * {@inheritDoc IDevtoolsMessage."type"}
		 */
		type: typeof MessageType;
	}

	/**
	 * Creates a {@link AudienceSummary.Message} from the provided {@link AudienceSummary.MessageData}.
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
