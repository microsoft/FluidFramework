/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

/**
 * Represents a summary of the current debug session state.
 */
export interface ClientDebuggerSummary {
	containerId: string;
	// TODO: containerData
	clientId: string | undefined;
	isContainerAttached: boolean;
	isContainerConnected: boolean;
	isContainerDirty: boolean;
	isContainerClosed: boolean;
	containerConnectionLog: readonly ConnectionStateChangeLogEntry[];
	containerResolvedUrl: IResolvedUrl | undefined;

	audienceMembers: readonly [string, IClient][];
	audienceHistory: readonly AudienceChangeLogEntry[];
}
