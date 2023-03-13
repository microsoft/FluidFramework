/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluidframework/protocol-definitions";
import { AudienceChangeLogEntry } from "../Logs";
import { HasContainerId } from "./DebuggerMessages";

import { IDebuggerMessage } from "./Messages";

/**
 * Inbound event requesting {@link AudienceChangeLogEntry} of the Container with the specific ID.
 * Will result in the {@link AudienceEventMessage} message being posted.
 *
 * @public
 */
export interface GetAudienceMessage extends IDebuggerMessage<HasContainerId> {
	type: "GET_AUDIENCE_EVENT";
}

/**
 * Message data format used by {@link AudienceEventMessage}.
 * @public
 */
export interface AudienceEventMessageData extends HasContainerId {
	/**
	 * Contents of the Audience event
	 */
	audienceState: Map<string, IClient>;
	audienceHistory: readonly AudienceChangeLogEntry[];
}

/**
 * Outbound event listing the current audience and audience history of the application
 * Includes the contents of the audience event
 *
 * @public
 */
export interface AudienceEventMessage extends IDebuggerMessage<AudienceEventMessageData> {
	type: "AUDIENCE_EVENT";
}
