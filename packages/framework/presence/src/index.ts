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

export type { ClientConnectionId } from "./baseTypes.js";

export type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceEntries,
	StatesWorkspaceSchema,
	StatesWorkspaceEntry,
	WorkspaceAddress,
} from "./types.js";

export {
	type Attendee,
	type AttendeesEvents,
	type AttendeeId,
	AttendeeStatus,
	type Presence,
	type PresenceEvents,
	type PresenceWithNotifications,
} from "./presence.js";

export type {
	BroadcastControls,
	BroadcastControlSettings,
} from "./broadcastControls.js";

export { getPresence, getPresenceAlpha } from "./getPresence.js";

export {
	getPresenceViaDataObject,
	type ExperimentalPresenceDO,
	ExperimentalPresenceManager,
} from "./datastorePresenceManagerFactory.js";

export type {
	LatestMap,
	// LatestMapArguments,
	LatestMapArgumentsRaw,
	LatestMapClientData,
	LatestMapEvents,
	LatestMapFactory,
	LatestMapItemRemovedClientData,
	LatestMapItemUpdatedClientData,
	LatestMapRaw,
	LatestMapRawEvents,
	StateMap,
} from "./latestMapValueManager.js";
export type {
	Latest,
	LatestArguments,
	LatestArgumentsRaw,
	LatestEvents,
	LatestFactory,
	LatestRaw,
	LatestRawEvents,
} from "./latestValueManager.js";
export type {
	Accessor,
	LatestClientData,
	LatestData,
	LatestMetadata,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateSchemaValidator,
	ValueAccessor,
} from "./latestValueTypes.js";

export {
	type NotificationEmitter,
	type NotificationListenable,
	type NotificationSubscriptions,
	Notifications,
	type NotificationsManager,
	type NotificationsManagerEvents,
} from "./notificationsManager.js";

export { StateFactory } from "./stateFactory.js";

export type { InternalTypes } from "./exposedInternalTypes.js";
export type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
