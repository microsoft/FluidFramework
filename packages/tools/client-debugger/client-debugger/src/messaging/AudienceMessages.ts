/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluidframework/protocol-definitions";

import { HasContainerId } from "../CommonInterfaces";
import { AudienceChangeLogEntry } from "../Logs";
import { IDebuggerMessage } from "./Messages";

// #region Inbound messages

/**
 * Metadata of clients within the Audience.
 *
 * @public
 */
export interface AudienceClientMetadata {
	/**
	 * Local users's clientId.
	 */
	clientId: string;

	/**
	 * Metadata about the client that was added or removed.
	 */
	client: IClient;
}

/**
 * {@link GetAudienceMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const GetAudienceMessageType = "GET_AUDIENCE";

/**
 * Inbound message requesting audience data from the Container with the specific ID.
 * Will result in the {@link AudienceSummaryMessage } message being posted.
 *
 * @public
 */
export interface GetAudienceMessage extends IDebuggerMessage<HasContainerId> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof GetAudienceMessageType;
}

// #endregion

// #region Outbound messages

/**
 * {@link AudienceSummaryMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const AudienceSummaryMessageType = "AUDIENCE_EVENT";

/**
 * Message data format used by {@link AudienceSummaryMessage }.
 *
 * @public
 */
export interface AudienceSummaryMessageData extends HasContainerId {
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
 * Audience event message which contains {@link AudienceSummaryMessageData} data.
 *
 * @public
 */
export interface AudienceSummaryMessage extends IDebuggerMessage<AudienceSummaryMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof AudienceSummaryMessageType;
}

// #endregion
