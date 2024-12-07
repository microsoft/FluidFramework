/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControlsTypes.js";
import type { ClientSessionId, ISessionClient } from "./sessionClientTypes.js";
import type {
	PresenceNotifications,
	PresenceNotificationsSchema,
	PresenceStates,
	PresenceStatesSchema,
	PresenceWorkspaceAddress,
} from "./types.js";

/**
 * @sealed
 * @alpha
 */
export interface PresenceEvents {
	/**
	 * Raised when new client joins session.
	 *
	 * @eventProperty
	 */
	attendeeJoined: (attendee: ISessionClient) => void;

	/**
	 * Raised when client appears disconnected from session.
	 *
	 * @eventProperty
	 */
	attendeeDisconnected: (attendee: ISessionClient) => void;

	/**
	 * Raised when a workspace is activated within the session.
	 *
	 * "Activated" means that a workspace is being used by a client and this
	 * client is seeing information for the first time.
	 *
	 * @remarks
	 * Local workspaces may be passively acquired/registered when this event
	 * is raised. For a notifications workspace, that lazy registration must
	 * be done before the event handler returns to ensure no notifications
	 * are missed.
	 */
	workspaceActivated: (
		workspaceAddress: PresenceWorkspaceAddress,
		type: "States" | "Notifications" | "Unknown",
	) => void;
}

/**
 * Presence represents known clients within a session and their custom states and notifications.
 *
 * @sealed
 * @alpha
 */
export interface IPresence {
	/**
	 * Events for Notifications manager.
	 */
	readonly events: Listenable<PresenceEvents>;

	/**
	 * Get all attendees in the session.
	 *
	 * @remarks
	 * Attendee states are dynamic and will change as clients join and leave
	 * the session.
	 */
	getAttendees(): ReadonlySet<ISessionClient>;

	/**
	 * Lookup a specific attendee in the session.
	 *
	 * @param clientId - Client connection or session ID
	 */
	getAttendee(clientId: ClientConnectionId | ClientSessionId): ISessionClient;

	/**
	 * Get this client's session client.
	 *
	 * @returns This client's session client.
	 */
	getMyself(): ISessionClient;

	/**
	 * Acquires a PresenceStates workspace from store or adds new one.
	 *
	 * @param workspaceAddress - Address of the requested PresenceStates Workspace
	 * @param requestedContent - Requested states for the workspace
	 * @param controls - Optional settings for default broadcast controls
	 * @returns A PresenceStates workspace
	 */
	getStates<StatesSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: StatesSchema,
		controls?: BroadcastControlSettings,
	): PresenceStates<StatesSchema>;

	/**
	 * Acquires a Notifications workspace from store or adds new one.
	 *
	 * @param workspaceAddress - Address of the requested Notifications Workspace
	 * @param requestedContent - Requested notifications for the workspace
	 * @returns A Notifications workspace
	 */
	getNotifications<NotificationsSchema extends PresenceNotificationsSchema>(
		notificationsId: PresenceWorkspaceAddress,
		requestedContent: NotificationsSchema,
	): PresenceNotifications<NotificationsSchema>;
}
