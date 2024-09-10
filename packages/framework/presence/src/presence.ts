/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectedClientId } from "./baseTypes.js";
import type { NotificationsManager } from "./notificationsManager.js";
import type {
	PresenceStates,
	PresenceWorkspaceAddress,
	PresenceStatesSchema,
} from "./types.js";

import type { ISubscribable } from "@fluid-experimental/presence/internal/events";
import type { InternalTypes } from "@fluid-experimental/presence/internal/exposedInternalTypes";

/**
 * A client within a Fluid session (period of container connectivity to service).
 *
 * @remarks
 * Note: This is very preliminary session client represenation.
 *
 * `ISessionClient` should be used as key to distinguish between different
 * clients as they join, rejoin, and disconnect from a session. While a
 * client's {@link ConnectedClientId} may change over time `ISessionClient`
 * will be fixed.
 *
 * @privateRemarks
 * As this is evolved, pay attention to how this relates to Audience, Service
 * Audience, and Quorum representations of clients and users.
 *
 * @sealed
 * @alpha
 */
export interface ISessionClient<
	SpecificClientId extends ConnectedClientId = ConnectedClientId,
> {
	/**
	 * Get current client connection id.
	 *
	 * @returns Current client connection id.
	 *
	 * @remarks
	 * Connection id will change on reconnection.
	 */
	currentClientId(): SpecificClientId;
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
