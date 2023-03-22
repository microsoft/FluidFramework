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
	clientId: string;
	client: IClient;
}

/**
 * Inbound event requesting audience data from the Container with the specific ID.
 * Will result in the {@link AudienceEventMessage} message being posted.
 *
 * @public
 */
export interface GetAudienceMessage extends IDebuggerMessage<HasContainerId> {
	type: "GET_AUDIENCE_EVENT";
}

/**
 * Message data format used by {@link AudienceEventMessage}.
 *
 * @public
 */
export interface AudienceEventMessageData extends HasContainerId {
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
 * @public
 */
export interface AudienceEventMessage extends IDebuggerMessage<AudienceEventMessageData> {
	type: "AUDIENCE_EVENT";
}
