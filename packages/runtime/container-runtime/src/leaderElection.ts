/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState, IPendingProposal, IQuorum } from "@microsoft/fluid-container-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";

export const QuorumKey = "leader";

/**
 * Elects the leader among the clients.
 */
export class LeaderElector extends EventEmitter {
    private leader: string;

    constructor(private readonly quorum: IQuorum, private connected: boolean) {
        super();
        this.attachQuorumListeners();
    }

    /**
     * Proposes new leader client for the quorum.
     */
    public async proposeLeadership(clientId: string) {
        assert(clientId !== undefined);
        assert(this.connected);
        return this.quorum.propose(QuorumKey, clientId);
    }

    /**
     * Get the current leader of the quorum.
     */
    public getLeader() {
        return this.leader;
    }

    public changeConnectionState(value: ConnectionState) {
        this.connected = value === ConnectionState.Connected;
    }

    private attachQuorumListeners() {
        this.quorum.on("approveProposal", (sequenceNumber: number, key: string, value: any) => {
            if (key === QuorumKey) {
                // We have potential leader.
                // But it's possible that this client got disconnected before proposal was accepted.
                // Given that we reject proposals only when they are made, there is no way to reject
                // proposal on client leaving, so we need to recover here by proposing ourselves
                const leader = value as string;
                if (this.quorum.getMember(leader) === undefined) {
                    this.emit("noLeader", leader);
                } else {
                    this.leader = leader;
                    this.emit("newLeader", this.leader);
                }
            }
        });

        this.quorum.on("addProposal", (proposal: IPendingProposal) => {
            if (proposal.key === QuorumKey) {
                // If we are disconnected, we can't reject proposal, as it results in sending message that can't be sent
                if (this.leader !== undefined && this.connected) {
                    proposal.reject();
                }
            }
        });

        this.quorum.on("removeMember", (removedClientId: string) => {
            if (removedClientId === this.leader) {
                this.leader = undefined;
                this.emit("leaderLeft", removedClientId);
            } else {
                this.emit("memberLeft", removedClientId);
            }
        });

        this.quorum.on("rejectProposal", (sequenceNumber: number, key: string, value: any) => {
            // Use of 'any' in template literal should be as safe as ("" + value) coercion.
            // tslint:disable-next-line:no-unsafe-any
            debug(`Proposal rejected @${sequenceNumber}. ${key}:${value}`);
        });
    }
}
