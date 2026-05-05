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

// Re-export from presence-definitions
export type {
	Accessor,
	Attendee,
	AttendeeId,
	AttendeesEvents,
	BroadcastControls,
	BroadcastControlSettings,
	ClientConnectionId,
	InternalPresenceTypes,
	InternalPresenceUtilityTypes,
	KeySchemaValidator,
	Latest,
	LatestArguments,
	LatestArgumentsRaw,
	LatestClientData,
	LatestConfiguration,
	LatestData,
	LatestEvents,
	LatestFactory,
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
	LatestMetadata,
	LatestRaw,
	LatestRawConfiguration,
	LatestRawEvents,
	NotificationEmitter,
	NotificationListenable,
	NotificationsConfiguration,
	NotificationsManager,
	NotificationsManagerEvents,
	NotificationSubscriberSignatures,
	NotificationsWithSubscriptionsConfiguration,
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	Presence,
	PresenceEvents,
	PresenceWithNotifications,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateMap,
	StateSchemaValidator,
	StatesWorkspace,
	StatesWorkspaceEntries,
	StatesWorkspaceEntry,
	StatesWorkspaceSchema,
	ValueAccessor,
	WorkspaceAddress,
} from "@fluid-internal/presence-definitions";
export { AttendeeStatus } from "@fluid-internal/presence-definitions";

// Re-export from presence-runtime
export {
	Notifications,
	StateFactory,
} from "@fluid-internal/presence-runtime/states";

// Local exports
export {
	getPresence,
	getPresenceFromDataStoreContext,
} from "./getPresence.js";
