/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

/**
 * A client's connection mode. Readonly or read/write.
 */
export type ConnectionMode = "write" | "read";

/**
 * TODO
 */
export interface ICapabilities {
	/**
	 * Indicates if the client represents a potentially interactive session with a user (if 'true') or if it's a "system entity" (if 'false').
	 * The only "system entity" scenario at the moment is the summarizer client.
	 */
	interactive: boolean;
}

/**
 * TODO
 */
export interface IClientDetails {
	/**
	 * TODO
	 */
	capabilities: ICapabilities;

	/**
	 * TODO
	 */
	type?: string;

	/**
	 * If the environment needs to specify multiple properties which gives info about the environment, then
	 * it should be in particular format like: `prop1:val1;prop2:val2;prop3:val3`.
	 */
	environment?: string;

	/**
	 * TODO
	 */
	device?: string;
}

/**
 * TODO
 */
export interface IClient {
	/**
	 * {@inheritDoc ConnectionMode}
	 */
	mode: ConnectionMode;

	/**
	 * TODO
	 */
	details: IClientDetails;

	/**
	 * TODO
	 */
	permission: string[];

	/**
	 * The user associated with this client.
	 *
	 * @remarks There may be more than 1 client associated with the same user.
	 */
	user: IUser;

	/**
	 * TODO
	 */
	scopes: string[];

	/**
	 * The time the client connected
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

export interface ISignalClient {
	/**
	 * The {@link ISignalClient.client}'s ID.
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
 * Contents sent with a ClientJoin message
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
