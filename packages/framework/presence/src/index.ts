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
	BroadcastControlSettings,
	BroadcastControls,
} from "./broadcastControlsTypes.js";
export type { InternalTypes as InternalPresenceTypes } from "./exposedInternalTypes.js";
export type { InternalUtilityTypes as InternalPresenceUtilityTypes } from "./exposedUtilityTypes.js";
export {
	getPresence,
	getPresenceAlpha,
	getPresenceFromDataStoreContext,
} from "./getPresence.js";
export type {
	KeySchemaValidator,
	LatestMap,
	LatestMapArguments,
	LatestMapArgumentsRaw,
	LatestMapClientData,
	LatestMapConfiguration,
	LatestMapEvents,
	LatestMapFactory,
	LatestMapItemRemovedClientData,
	LatestMapItemUpdatedClientData,
	LatestMapRaw,
	LatestMapRawConfiguration,
	LatestMapRawEvents,
	StateMap,
} from "./latestMapTypes.js";
export type {
	Latest,
	LatestArguments,
	LatestArgumentsRaw,
	LatestConfiguration,
	LatestEvents,
	LatestFactory,
	LatestRaw,
	LatestRawConfiguration,
	LatestRawEvents,
} from "./latestTypes.js";
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
export { Notifications } from "./notificationsManager.js";
export type {
	NotificationEmitter,
	NotificationListenable,
	NotificationSubscriberSignatures,
	NotificationsConfiguration,
	NotificationsManager,
	NotificationsManagerEvents,
	NotificationsWithSubscriptionsConfiguration,
} from "./notificationsManagerTypes.js";
export {
	type Attendee,
	type AttendeeId,
	AttendeeStatus,
	type AttendeesEvents,
	type Presence,
	type PresenceEvents,
	type PresenceWithNotifications,
} from "./presence.js";
export { StateFactory } from "./stateFactory.js";
export type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceEntries,
	StatesWorkspaceEntry,
	StatesWorkspaceSchema,
	WorkspaceAddress,
} from "./types.js";
