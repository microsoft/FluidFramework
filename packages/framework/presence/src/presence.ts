/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { ClientConnectionId } from "./baseTypes.js";
import type {
	PresenceNotifications,
	PresenceNotificationsSchema,
	PresenceStates,
	PresenceStatesSchema,
	PresenceWorkspaceAddress,
} from "./types.js";

import type { ISubscribable } from "@fluid-experimental/presence/internal/events";

/**
 * A Fluid client session identifier.
 *
 * @remarks
 * Each client once connected to a session is given a unique identifier for the
 * duration of the session. If a client disconnects and reconnects, it will
 * retain its identifier. Prefer use of {@link ISessionClient} as a way to
 * identify clients in a session. {@link ISessionClient.sessionId} will provide
 * the session id.
 *
 * @alpha
 */
export type ClientSessionId = SessionId & { readonly ClientSessionId: "ClientSessionId" };

/**
 * The connection status of the {@link ISessionClient}.
 *
 * @alpha
 */
export const SessionClientStatus = {
	Connected: "Connected",
	Disconnected: "Disconnected",
} as const;

/**
 * Type for the connection status of the {@link ISessionClient}.
 *
 * @alpha
 */
export type SessionClientStatus =
	(typeof SessionClientStatus)[keyof typeof SessionClientStatus];

/**
 * A client within a Fluid session (period of container connectivity to service).
 *
 * @remarks
 * Note: This is very preliminary session client representation.
 *
 * `ISessionClient` should be used as key to distinguish between different
 * clients as they join, rejoin, and disconnect from a session. While a
 * client's {@link ClientConnectionId} may change over time `ISessionClient`
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
	SpecificSessionClientId extends ClientSessionId = ClientSessionId,
> {
	readonly sessionId: SpecificSessionClientId;

	/**
	 * Get current client connection id.
	 *
	 * @returns Current client connection id.
	 *
	 * @remarks
	 * Connection id will change on reconnect.
	 *
	 * If {@link ISessionClient.getStatus} is {@link (SessionClientStatus:variable).Disconnected}, this will represent the last known connection id.
	 */
	getConnectionId(): ClientConnectionId;

	/**
	 * Get status of session client.
	 *
	 * @returns Status of session client.
	 *
	 */
	getStatus(): SessionClientStatus;
}

/**
 * Utility type limiting to a specific session client. (A session client with
 * a specific session id - not just any session id.)
 *
 * @internal
 */
export type SpecificSessionClient<SpecificSessionClientId extends ClientSessionId> =
	string extends SpecificSessionClientId ? never : ISessionClient<SpecificSessionClientId>;

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
	 * @param clientId - Client connection or session id
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
	 * @param requestedContent - Requested notifications for the workspace
	 * @returns A Notifications workspace
	 */
	getNotifications<NotificationsSchema extends PresenceNotificationsSchema>(
		notificationsId: PresenceWorkspaceAddress,
		requestedContent: NotificationsSchema,
	): PresenceNotifications<NotificationsSchema>;
}
