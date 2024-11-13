/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Experimental package for client presence within a connected session.
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
// } from "@fluid-experimental/presence/internal/core-interfaces";

// If desired these are the "required" types from events.
// export type {
// 	Events,
// 	IsEvent,
// 	ISubscribable,
// } from "@fluid-experimental/presence/internal/events";

export type { ClientConnectionId } from "./baseTypes.js";

export type {
	PresenceNotifications,
	PresenceNotificationsSchema,
	PresenceStates,
	PresenceStatesEntries,
	PresenceStatesEntry,
	PresenceStatesSchema,
	PresenceWorkspaceAddress,
} from "./types.js";

export {
	type ClientSessionId,
	type IPresence,
	type ISessionClient,
	type PresenceEvents,
	SessionClientStatus,
} from "./presence.js";

export { acquirePresence } from "./experimentalAccess.js";

export {
	acquirePresenceViaDataObject,
	type ExperimentalPresenceDO,
	ExperimentalPresenceManager,
} from "./datastorePresenceManagerFactory.js";

export type { LatestValueControls } from "./latestValueControls.js";
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
	type NotificationSubscribable,
	type NotificationSubscriptions,
	Notifications,
	type NotificationsManager,
	type NotificationsManagerEvents,
} from "./notificationsManager.js";
