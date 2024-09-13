/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IAudienceEvents, ISelf } from "@fluidframework/container-definitions";
import { IAudienceOwner } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { IClient } from "@fluidframework/driver-definitions";

/**
 * Audience represents all clients connected to the op stream.
 */
export class Audience extends TypedEventEmitter<IAudienceEvents> implements IAudienceOwner {
	private readonly members = new Map<string, IClient>();
	private _currentClientId: string | undefined;

	constructor() {
		super();
		// We are expecting this class to have many listeners, so we suppress noisy "MaxListenersExceededWarning" logging.
		super.setMaxListeners(0);
	}

	public getSelf(): ISelf | undefined {
		return this._currentClientId === undefined
			? undefined
			: {
					clientId: this._currentClientId,
					client: this.getMember(this._currentClientId),
				};
	}

	public setCurrentClientId(clientId: string): void {
		if (this._currentClientId !== clientId) {
			const oldId = this._currentClientId;
			this._currentClientId = clientId;
			// this.getMember(clientId) could resolve to undefined in these two cases:
			// 1) Feature gates controlling ConnectionStateHandler() behavior are off
			// 2) we are loading from stashed state and audience is empty, but we remember and set prior clientId
			this.emit(
				"selfChanged",
				oldId === undefined ? undefined : ({ clientId: oldId } satisfies ISelf),
				{ clientId, client: this.getMember(clientId) } satisfies ISelf,
			);
		}
	}

	/**
	 * Adds a new client to the audience
	 */
	public addMember(clientId: string, details: IClient): void {
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
		if (removedClient === undefined) {
			return false;
		} else {
			this.members.delete(clientId);
			this.emit("removeMember", clientId, removedClient);
			return true;
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
