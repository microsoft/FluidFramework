/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectedClientId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { NotificationsManager } from "./notificationsManager.js";
import type {
	PresenceStates,
	PresenceWorkspaceAddress,
	PresenceStatesSchema,
} from "./types.js";

import type { ISubscribable } from "@fluid-experimental/presence/internal/events";

/**
 * A client within a Fluid session (period of container connectivity to service).
 *
 * @sealed
 * @alpha
 */
export interface ISessionClient {
	/**
	 * Get current client connection id.
	 *
	 * @returns Current client connection id.
	 *
	 * @remarks
	 * Connection id will change on reconnection.
	 */
	currentClientId(): ConnectedClientId;
}

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
	readonly events: ISubscribable<PresenceEvents>;

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
	 * @param clientId - Client connection id
	 */
	getAttendee(clientId: ConnectedClientId): ISessionClient;

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
	 * @returns A PresenceStates workspace
	 */
	getStates<StatesSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: StatesSchema,
	): PresenceStates<StatesSchema>;

	/**
	 * Acquires a Notifications workspace from store or adds new one.
	 *
	 * @param workspaceAddress - Address of the requested Notifications Workspace
	 * @returns A Notifications workspace
	 */
	getNotifications<
		NotificationsSchema extends {
			[key: string]: InternalTypes.ManagerFactory<
				typeof key,
				InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
				NotificationsManager<any>
			>;
		},
	>(
		notificationsId: PresenceWorkspaceAddress,
		requestedContent: NotificationsSchema,
	): PresenceStates<NotificationsSchema, NotificationsManager<any>>;
}
