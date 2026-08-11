/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Test-only exports.
 */

export { broadcastJoinResponseDelaysMs } from "./presenceDatastoreManager.js";

export { createPresenceManager } from "./presenceManager.js";

export type {
	GeneralDatastoreMessageContent,
	InboundClientJoinMessage,
	InboundDatastoreUpdateMessage,
	InternalWorkspaceAddress,
	OutboundClientJoinMessage,
	OutboundDatastoreUpdateMessage,
} from "./protocol.js";

export type { IEphemeralRuntime } from "./runtimeTypes.js";
