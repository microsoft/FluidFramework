import { IPendingProposal, IQuorum } from "@prague/container-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

export const QuorumKey = "leader";

export class LeaderElector extends EventEmitter {
    private leader: string;

    constructor(private quorum: IQuorum, private clientId: string) {
        super();
        this.attachQuorumListeners();
    }

    public async proposeLeadership() {
        return this.quorum.propose(QuorumKey, this.clientId);
    }

    public getLeader() {
        return this.leader;
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
                if (this.leader !== undefined) {
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
