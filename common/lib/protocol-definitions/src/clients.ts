/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "./scopes";
import { IUser } from "./users";

/**
 * A client's connection mode - either view-only ("read") or allowing edits ("write").
 *
 * @remarks
 *
 * Note: a user's connection mode is dependent on their permissions.
 * E.g. a user with read-only permissions will not be allowed a "write" connection mode.
 */
export type ConnectionMode = "write" | "read";

/**
 * Capabilities of a Client.
 * In particular, whether or not the client is {@link ICapabilities.interactive}.
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
 * TODO
 */
export interface IClientDetails {
	/**
	 * {@inheritDoc ICapabilities}
	 */
	capabilities: ICapabilities;

	/**
	 * TODO: What is this? Are there specific expected values? What does it mean for this to be undefined?
	 */
	type?: string;

	/**
	 * If the environment needs to specify multiple properties which gives info about the environment, then
	 * it should be in particular format like: `prop1:val1;prop2:val2;prop3:val3`.
	 *
	 * TODO: What does it mean for this to be undefined?
	 */
	environment?: string;

	/**
	 * TODO: What is this? What does it mean for this to be undefined?
	 */
	device?: string;
}

/**
 * Represents a client connected to a Fluid service, including associated user details, permissions, and connection mode.
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

	/**
	 * TODO: What is this? Are there specific values we expect?
	 *
	 * This doesn't appear to be used. Safe to remove?
	 */
	permission: string[];

	/**
	 * The user information associated with this client connection.
	 */
	user: IUser;

	/**
	 * Enumerates actions allowed for the client connection.
	 *
	 * @remarks
	 *
	 * General `string` values are allowed for type-wise backwards compatibility, but this support
	 * will be removed in the future.
	 */
	scopes: (ScopeType | string)[];

	/**
	 * The time the client connected to the service.
	 *
	 * @remarks This is optional for backwards compatibility, but will be required in the future.
	 */
	timestamp?: number;
}

/**
 * A client that has been acknowledged by the sequencer.
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
 * TODO
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
	 *
	 * TODO: What does it mean for this to be undefined?
	 */
	clientConnectionNumber?: number;

	/**
	 * Sequence number that indicates when the signal was created in relation to the delta stream.
	 *
	 * TODO: What does it mean for this to be undefined?
	 */
	referenceSequenceNumber?: number;
}

/**
 * Contents sent with a `ClientJoin` message.
 */
export interface IClientJoin {
	/**
	 * The ID of the joining client.
	 */
	clientId: string;

	/**
	 * Details about the joining client (i.e. browser based, server, CPU, memory, etc...).
	 */
	detail: IClient;
}
