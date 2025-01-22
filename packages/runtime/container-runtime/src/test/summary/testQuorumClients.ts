/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IQuorumClients, ISequencedClient } from "@fluidframework/driver-definitions";
import { IQuorumEvents } from "@fluidframework/driver-definitions/internal";

export class TestQuorumClients
	extends TypedEventEmitter<IQuorumEvents>
	implements IQuorumClients
{
	public disposed = false;
	public dispose(): void {
		this.disposed = true;
	}

	private readonly members = new Map<string, ISequencedClient>();

	public getMembers(): Map<string, ISequencedClient> {
		return this.members;
	}

	public getMember(clientId: string): ISequencedClient | undefined {
		return this.members.get(clientId);
	}

	public addClient(clientId: string, client: ISequencedClient): void {
		this.members.set(clientId, client);
		this.emit("addMember", clientId, client);
	}

	public removeClient(clientId: string): void {
		this.members.delete(clientId);
		this.emit("removeMember", clientId);
	}

	public reset(): void {
		this.members.clear();
		this.removeAllListeners();
	}
}
