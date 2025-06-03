/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import type { SessionId } from "@fluidframework/id-compressor";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceSchema,
	WorkspaceAddress,
} from "./types.js";

/**
 * A Fluid client session identifier.
 *
 * @remarks
 * Each client once connected to a session is given a unique identifier for the
 * duration of the session. If a client disconnects and reconnects, it will
 * retain its identifier. Prefer use of {@link Attendee} as a way to
 * identify clients in a session. {@link Attendee.attendeeId} will provide
 * the session ID.
 *
 * @beta
 */
export type AttendeeId = SessionId & { readonly AttendeeId: "AttendeeId" };

/**
 * The connection status of the {@link Attendee}.
 *
 * @beta
 */
export const AttendeeStatus = {
	/**
	 * The {@link Attendee} is connected to the Fluid service.
	 */
	Connected: "Connected",

	/**
	 * The {@link Attendee} is not connected to the Fluid service.
	 */
	Disconnected: "Disconnected",
} as const;

/**
 * Represents the connection status of an {@link Attendee}.
 *
 * This type can be either `'Connected'` or `'Disconnected'`, indicating whether
 * the attendee is currently connected to the Fluid service.
 *
 * When `'Disconnected'`:
 * - State changes are kept locally and communicated to others upon reconnect.
 * - Notification requests are discarded (silently).
 *
 * @beta
 */
export type AttendeeStatus = (typeof AttendeeStatus)[keyof typeof AttendeeStatus];

/**
 * A client within a Fluid session (period of container connectivity to service).
 *
 * @remarks
 * Note: This is very preliminary attendee representation.
 *
 * {@link Attendee} should be used as key to distinguish between different
 * clients as they join, rejoin, and disconnect from a session. While a
 * client's {@link ClientConnectionId} from {@link Attendee.getConnectionStatus}
 * may change over time, `Attendee` will be fixed.
 *
 * @privateRemarks
 * As this is evolved, pay attention to how this relates to Audience, Service
 * Audience, and Quorum representations of clients and users.
 *
 * @sealed
 * @beta
 */
export interface Attendee<SpecificAttendeeId extends AttendeeId = AttendeeId> {
	/**
	 * The session ID of the client that is stable over all connections.
	 */
	readonly attendeeId: SpecificAttendeeId;

	/**
	 * Get current client connection ID.
	 *
	 * @returns Current client connection ID.
	 *
	 * @remarks
	 * Connection ID will change on reconnect.
	 *
	 * If {@link Attendee.getConnectionStatus} is {@link (AttendeeStatus:variable).Disconnected}, this will represent the last known connection ID.
	 */
	getConnectionId(): ClientConnectionId;

	/**
	 * Get connection status of attendee.
	 *
	 * @returns Connection status of attendee.
	 *
	 */
	getConnectionStatus(): AttendeeStatus;
}

/**
 * Utility type limiting to a specific attendee. (A attendee with
 * a specific session ID - not just any session ID.)
 */
export type SpecificAttendee<SpecificAttendeeId extends AttendeeId> =
	string extends SpecificAttendeeId ? never : Attendee<SpecificAttendeeId>;

/**
 * Events from {@link Presence.attendees}.
 *
 * @sealed
 * @beta
 */
export interface AttendeesEvents {
	/**
	 * Raised when new client joins session.
	 *
	 * @eventProperty
	 */
	attendeeConnected: (attendee: Attendee) => void;

	/**
	 * Raised when client appears disconnected from session.
	 *
	 * @eventProperty
	 */
	attendeeDisconnected: (attendee: Attendee) => void;
}

/**
 * Events from {@link Presence}.
 *
 * @sealed
 * @beta
 */
export interface PresenceEvents {
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
		workspaceAddress: WorkspaceAddress,
		type: "States" | "Notifications" | "Unknown",
	) => void;
}

/**
 * Presence represents known clients within a session and their custom states.
 *
 * @sealed
 * @beta
 */
export interface Presence {
	/**
	 * Events for Presence.
	 */
	readonly events: Listenable<PresenceEvents>;

	readonly attendees: {
		/**
		 * Events for {@link Attendee}s.
		 */
		readonly events: Listenable<AttendeesEvents>;

		/**
		 * Get all {@link Attendee}s in the session.
		 *
		 * @remarks
		 * Attendee states are dynamic and will change as clients join and leave
		 * the session.
		 */
		getAttendees(): ReadonlySet<Attendee>;

		/**
		 * Lookup a specific {@link Attendee} in the session.
		 *
		 * @param clientId - Client connection or session ID
		 */
		getAttendee(clientId: ClientConnectionId | AttendeeId): Attendee;

		/**
		 * Get this client's {@link Attendee}.
		 *
		 * @returns This client's attendee.
		 */
		getMyself(): Attendee;
	};

	readonly states: {
		/**
		 * Acquires a {@link StatesWorkspace} from store or adds new one.
		 *
		 * @param workspaceAddress - Address of the requested {@link StatesWorkspace}
		 * @param requestedStates - Requested states for the workspace
		 * @param controls - Optional settings for default broadcast controls
		 * @returns A {@link StatesWorkspace}
		 */
		getWorkspace<StatesSchema extends StatesWorkspaceSchema>(
			workspaceAddress: WorkspaceAddress,
			requestedStates: StatesSchema,
			controls?: BroadcastControlSettings,
		): StatesWorkspace<StatesSchema>;
	};
}

/**
 * Presence represents known clients within a session and their custom states and notifications.
 *
 * @remarks
 * To access this alpha API, cast any `{@link Presence}` to `PresenceWithNotifications`.
 *
 * @sealed
 * @alpha
 */
export interface PresenceWithNotifications extends Presence {
	readonly notifications: {
		/**
		 * Acquires a Notifications workspace from store or adds new one.
		 *
		 * @param workspaceAddress - Address of the requested Notifications Workspace
		 * @param requestedNotifications - Requested notifications for the workspace
		 * @returns A Notifications workspace
		 */
		getWorkspace<NotificationsSchema extends NotificationsWorkspaceSchema>(
			notificationsId: WorkspaceAddress,
			requestedNotifications: NotificationsSchema,
		): NotificationsWorkspace<NotificationsSchema>;
	};
}
