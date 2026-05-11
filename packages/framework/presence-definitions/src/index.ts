/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { ClientConnectionId } from "./baseTypes.js";

export type { BroadcastControls, BroadcastControlSettings } from "./broadcastControlsTypes.js";

export type { InternalTypes as InternalPresenceTypes } from "./exposedInternalTypes.js";

export type { InternalUtilityTypes as InternalPresenceUtilityTypes } from "./exposedUtilityTypes.js";

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

export type {
	NotificationEmitter,
	NotificationListenable,
	NotificationsConfiguration,
	NotificationsManager,
	NotificationsManagerEvents,
	NotificationSubscriberSignatures,
	NotificationsWithSubscriptionsConfiguration,
} from "./notificationsManagerTypes.js";

export type {
	Attendee,
	AttendeeId,
	AttendeesEvents,
	Presence,
	PresenceEvents,
	PresenceWithNotifications,
} from "./presence.js";
export { AttendeeStatus } from "./presence.js";

export type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceEntries,
	StatesWorkspaceEntry,
	StatesWorkspaceSchema,
	WorkspaceAddress,
} from "./types.js";
