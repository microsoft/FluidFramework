/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { ClientConnectionId } from "./baseTypes.js";

/**
 * A Fluid client session identifier.
 *
 * @remarks
 * Each client once connected to a session is given a unique identifier for the
 * duration of the session. If a client disconnects and reconnects, it will
 * retain its identifier. Prefer use of {@link ISessionClient} as a way to
 * identify clients in a session. {@link ISessionClient.sessionId} will provide
 * the session ID.
 *
 * @alpha
 */
export type ClientSessionId = SessionId & { readonly ClientSessionId: "ClientSessionId" };

/**
 * Represents the connection status of an {@link ISessionClient}.
 *
 * This type can be either `'Connected'` or `'Disconnected'`, indicating whether
 * the session client is currently connected to the Fluid service.
 *
 * When `'Disconnected'`:
 * - State changes are kept locally and communicated to others upon reconnect.
 * - Notification requests are discarded (silently).
 *
 * @alpha
 */
export type SessionClientStatus = "Connected" | "Disconnected";

/**
 * A client within a Fluid session (period of container connectivity to service).
 *
 * @remarks
 * Note: This is very preliminary session client representation.
 *
 * `ISessionClient` should be used as key to distinguish between different
 * clients as they join, rejoin, and disconnect from a session. While a
 * client's {@link ClientConnectionId} from {@link ISessionClient.getConnectionStatus}
 * may change over time, `ISessionClient` will be fixed.
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
	/**
	 * The session ID of the client that is stable over all connections.
	 */
	readonly sessionId: SpecificSessionClientId;

	/**
	 * Get current client connection ID.
	 *
	 * @returns Current client connection ID.
	 *
	 * @remarks
	 * Connection ID will change on reconnect.
	 *
	 * If {@link ISessionClient.getConnectionStatus} is {@link (SessionClientStatusEnum:variable).Disconnected}, this will represent the last known connection ID.
	 */
	getConnectionId(): ClientConnectionId;

	/**
	 * Get connection status of session client.
	 *
	 * @returns Connection status of session client.
	 *
	 */
	getConnectionStatus(): SessionClientStatus;
}

/**
 * Utility type limiting to a specific session client. (A session client with
 * a specific session ID - not just any session ID.)
 *
 * @internal
 */
export type SpecificSessionClient<SpecificSessionClientId extends ClientSessionId> =
	string extends SpecificSessionClientId ? never : ISessionClient<SpecificSessionClientId>;
