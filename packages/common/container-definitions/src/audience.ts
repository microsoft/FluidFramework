/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// False positive: this is an import from the `events` package, not from Node.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { EventEmitter } from "events";
import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Manages the state and the members for {@link IAudience}
 * @alpha
 */
export interface IAudienceOwner extends IAudience {
	/**
	 * Adds a new client to the audience
	 */
	addMember(clientId: string, details: IClient): void;

	/**
	 * Removes a client from the audience. Only emits an event if a client is actually removed
	 * @returns if a client was removed from the audience
	 */
	removeMember(clientId: string): boolean;
}

/**
 * Audience represents all clients connected to the op stream, both read-only and read/write.
 *
 * See {@link https://nodejs.org/api/events.html#class-eventemitter | here} for an overview of the `EventEmitter`
 * class.
 * @public
 */
export interface IAudience extends EventEmitter {
	/**
	 * See {@link https://nodejs.dev/learn/the-nodejs-event-emitter | here} for an overview of `EventEmitter.on`.
	 */
	on(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): this;

	/**
	 * List all clients connected to the op stream, keyed off their clientId
	 */
	getMembers(): Map<string, IClient>;

	/**
	 * Get details about the connected client with the specified clientId,
	 * or undefined if the specified client isn't connected
	 */
	getMember(clientId: string): IClient | undefined;
}
