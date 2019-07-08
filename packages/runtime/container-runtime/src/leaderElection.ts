/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState, IPendingProposal, IQuorum } from "@prague/container-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

export const QuorumKey = "leader";

/**
 * Elects the leader among the clients.
 */
export class LeaderElector extends EventEmitter {
    private leader: string;
    private connected = false;

    constructor(private readonly quorum: IQuorum, private readonly clientId: string) {
        super();
        this.attachQuorumListeners();
    }

    /**
     * Proposes new leader client for the quorum.
     */
    public async proposeLeadership() {
        return this.quorum.propose(QuorumKey, this.clientId);
    }

    /**
     * Get the current leader of the quorum.
     */
    public getLeader() {
        return this.leader;
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.connected = value === ConnectionState.Connected;
    }

    private attachQuorumListeners() {
        this.quorum.on("approveProposal", (sequenceNumber: number, key: string, value: any) => {
            if (key === QuorumKey) {
                this.leader = value as string;
                this.emit("newLeader", this.leader);
            }
        });

        this.quorum.on("addProposal", (proposal: IPendingProposal) => {
            if (proposal.key === QuorumKey) {
                // If we are not connected, we can't reject proposal :(
                if (this.leader !== undefined && this.connected) {
                    proposal.reject();
                }
            }
        });

        this.quorum.on("removeMember", (removedClientId: string) => {
            if (this.leader === undefined) {
                this.emit("noLeader", removedClientId);
            } else if (removedClientId === this.leader) {
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
