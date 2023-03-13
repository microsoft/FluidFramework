/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import { IAudience } from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { AudienceChangeLogEntry } from "../Logs";
import { IDebuggerMessage } from "./Messages";

/**
 * Message data format used by {@link AudienceEventMessage}.
 * @public
 */
export interface AudienceEventMessageData {
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
