/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICommittedProposal, IQuorum, IQuorumEvents, ISequencedClient } from "@fluidframework/protocol-definitions";

export class TestQuorum extends TypedEventEmitter<IQuorumEvents> implements IQuorum {
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

    private readonly values = new Map<string, any>();

    public async propose(key: string, value: any): Promise<void> {
        this.values.set(key, value);
    }

    public has(key: string): boolean {
        return this.values.has(key);
    }

    public get(key: string): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.values.get(key);
    }

    public getApprovalData(key: string): ICommittedProposal | undefined {
        const value = this.values.get(key);
        if (value === undefined) {
            return undefined;
        }
        return {
            key,
            value,
            commitSequenceNumber: 0,
            approvalSequenceNumber: 0,
            sequenceNumber: 0,
        };
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
        this.values.clear();
        this.removeAllListeners();
    }
}
