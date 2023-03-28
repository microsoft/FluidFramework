/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluidframework/protocol-definitions";
import { AudienceChangeLogEntry } from "../Logs";
import { HasContainerId } from "./DebuggerMessages";
import { IDebuggerMessage } from "./Messages";

/**
 * Metadata of clients within the Audience.
 *
 * @public
 */
export interface AudienceClientMetaData {
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
 * Inbound message requesting audience data from the Container with the specific ID.
 * Will result in the {@link AudienceSummaryMessage } message being posted.
 *
 * @public
 */
export interface GetAudienceMessage extends IDebuggerMessage<HasContainerId> {
	type: "GET_AUDIENCE";
}

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
	audienceState: AudienceClientMetaData[];

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
	type: "AUDIENCE_EVENT";
}
