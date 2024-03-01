/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IAudienceOwner } from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Audience represents all clients connected to the op stream.
 */
export class Audience extends EventEmitter implements IAudienceOwner {
	private readonly members = new Map<string, IClient>();

	constructor() {
		super();
		// We are expecting this class to have many listeners, so we suppress noisy "MaxListenersExceededWarning" logging.
		super.setMaxListeners(0);
	}

	public on(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): this;
	public on(event: string, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}

	/**
	 * Adds a new client to the audience
	 */
	public addMember(clientId: string, details: IClient) {
		// Given that signal delivery is unreliable process, we might observe same client being added twice
		// In such case we should see exactly same payload (IClient), and should not raise event twice!
		if (this.members.has(clientId)) {
			const client = this.members.get(clientId);
			assert(
				JSON.stringify(client) === JSON.stringify(details),
				0x4b2 /* new client has different payload from existing one */,
			);
		} else {
			this.members.set(clientId, details);
			this.emit("addMember", clientId, details);
		}
	}

	/**
	 * Removes a client from the audience. Only emits an event if a client is actually removed
	 * @returns if a client was removed from the audience
	 */
	public removeMember(clientId: string): boolean {
		const removedClient = this.members.get(clientId);
		if (removedClient !== undefined) {
			this.members.delete(clientId);
			this.emit("removeMember", clientId, removedClient);
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Retrieves all the members in the audience.
	 *
	 * @remarks When the container is disconnected, this will keep returning the audience as it was last seen before the
	 * container disconnected.
	 */
	public getMembers(): Map<string, IClient> {
		return new Map(this.members);
	}

	/**
	 * Retrieves a specific member of the audience.
	 *
	 * @remarks When the container is disconnected, this will keep returning members from the audience as it was last seen
	 * before the container disconnected.
	 */
	public getMember(clientId: string): IClient | undefined {
		return this.members.get(clientId);
	}
}
