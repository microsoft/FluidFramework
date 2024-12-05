/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Package for client presence within a connected session.
 *
 * See {@link https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#readme | README.md } for an overview of the package.
 *
 * @packageDocumentation
 */

// If desired these are the "required" types from core-interfaces.
// export type {
// 	InternalUtilityTypes,
// 	JsonDeserialized,
// 	JsonSerializable,
// } from "@fluidframework/presence/internal/core-interfaces";

export type { ClientConnectionId } from "./baseTypes.js";

export type {
	PresenceNotifications,
	PresenceNotificationsSchema,
	PresenceStates,
	PresenceStatesEntries,
	PresenceStatesSchema,
	PresenceWorkspaceAddress,
	PresenceWorkspaceEntry,
} from "./types.js";

export {
	type ClientSessionId,
	type IPresence,
	type ISessionClient,
	type PresenceEvents,
	SessionClientStatus,
} from "./presence.js";

export type {
	BroadcastControls,
	BroadcastControlSettings,
} from "./broadcastControls.js";

export { acquirePresence } from "./experimentalAccess.js";

export {
	acquirePresenceViaDataObject,
	type ExperimentalPresenceDO,
	ExperimentalPresenceManager,
} from "./datastorePresenceManagerFactory.js";

export {
	LatestMap,
	type LatestMapItemRemovedClientData,
	type LatestMapItemValueClientData,
	type LatestMapValueClientData,
	type LatestMapValueManager,
	type LatestMapValueManagerEvents,
	type ValueMap,
} from "./latestMapValueManager.js";
export {
	Latest,
	type LatestValueManager,
	type LatestValueManagerEvents,
} from "./latestValueManager.js";
export type {
	LatestValueClientData,
	LatestValueData,
	LatestValueMetadata,
} from "./latestValueTypes.js";

export {
	type NotificationEmitter,
	type NotificationListenable,
	type NotificationSubscriptions,
	Notifications,
	type NotificationsManager,
	type NotificationsManagerEvents,
} from "./notificationsManager.js";
