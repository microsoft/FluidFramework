/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

/**
 * A client's connection mode - either view-only ("read") or allowing edits ("write").
 *
 * @remarks
 *
 * Note: a user's connection mode is dependent on their permissions.
 * E.g. a user with read-only permissions will not be allowed a "write" connection mode.
 * @public
 */
export type ConnectionMode = "write" | "read";

/**
 * Capabilities of a Client.
 * In particular, whether or not the client is {@link ICapabilities.interactive}.
 * @public
 */
export interface ICapabilities {
	/**
	 * Indicates if the client represents a potentially interactive session with a user (if 'true') or if it's
	 * a "system entity" (if 'false').
	 *
	 * @remarks
	 *
	 * The only "system entity" scenario at the moment is the
	 * {@link https://fluidframework.com/docs/concepts/summarizer/ | summarizer client}.
	 */
	interactive: boolean;
}

/**
 * {@link IClient} connection / environment metadata.
 * @public
 */
export interface IClientDetails {
	/**
	 * {@inheritDoc ICapabilities}
	 */
	capabilities: ICapabilities;

	/**
	 * The kind of client being described.
	 *
	 * `undefined` indicates that the kind could not be determined.
	 */
	type?: string;

	/**
	 * @remarks
	 *
	 * If the environment needs to specify multiple properties which gives info about the environment, then
	 * it should be in particular format like: "prop1:val1;prop2:val2;prop3:val3"
	 */
	environment?: string;
	device?: string;
}

/**
 * Represents a client connected to a Fluid service, including associated user details, permissions, and connection mode.
 * @public
 */
export interface IClient {
	/**
	 * {@inheritDoc ConnectionMode}
	 */
	mode: ConnectionMode;

	/**
	 * {@inheritDoc IClientDetails}
	 */
	details: IClientDetails;

	permission: string[];

	/**
	 * The user information associated with this client connection.
	 */
	user: IUser;

	/**
	 * Enumerates actions allowed for the client connection.
	 */
	scopes: string[];

	/**
	 * The time the client connected to the service.
	 */
	timestamp?: number;
}

/**
 * A {@link IClient} that has been acknowledged by the sequencer.
 * @public
 */
export interface ISequencedClient {
	/**
	 * The underlying client details.
	 */
	client: IClient;

	/**
	 * The sequence number of the "join" message sent when the client joined the session.
	 */
	sequenceNumber: number;
}

/**
 * @alpha
 */
export interface ISignalClient {
	/**
	 * The {@link ISignalClient.client}'s unique ID.
	 */
	clientId: string;

	/**
	 * The underlying client details.
	 */
	client: IClient;

	/**
	 * Counts the number of signals sent by the client.
	 */
	clientConnectionNumber?: number;

	/**
	 * Sequence number that indicates when the signal was created in relation to the delta stream.
	 */
	referenceSequenceNumber?: number;
}

/**
 * Contents sent with a `ClientJoin` message.
 * @internal
 */
export interface IClientJoin {
	/**
	 * The ID of the joining client.
	 */
	clientId: string;

	/**
	 * The underlying client details.
	 */
	detail: IClient;
}
