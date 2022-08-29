/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IQuorumClients,
    IQuorumEvents,
    ISequencedClient,
} from "@fluidframework/protocol-definitions";

export class TestQuorumClients extends TypedEventEmitter<IQuorumEvents> implements IQuorumClients {
    public disposed = false;
    public dispose() {
        this.disposed = true;
    }

    private readonly members = new Map<string, ISequencedClient>();

    public getMembers(): Map<string, ISequencedClient> {
        return this.members;
    }

    public getMember(clientId: string): ISequencedClient | undefined {
        return this.members.get(clientId);
    }

    public addClient(clientId: string, client: ISequencedClient) {
        this.members.set(clientId, client);
        this.emit("addMember", clientId, client);
    }

    public removeClient(clientId: string) {
        this.members.delete(clientId);
        this.emit("removeMember", clientId);
    }

    public reset() {
        this.members.clear();
        this.removeAllListeners();
    }
}
