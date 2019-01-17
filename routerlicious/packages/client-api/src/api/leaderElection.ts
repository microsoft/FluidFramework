import { IPendingProposal, IQuorum } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class LeaderElector extends EventEmitter {

    private leader: string;
    constructor(private quorum: IQuorum, private clientId: string) {
        super();
        this.attachQuorumListeners();
        this.quorum.propose("leader", this.clientId).then(() => {
            // console.log(`Proposal accepted: ${this.clientId}!`);
        }, (err) => {
            // console.log(`Error proposing new leadership: ${err}`);
        });
    }

    public getLeader() {
        return this.leader;
    }

    private attachQuorumListeners() {
        this.quorum.on("approveProposal", (sequenceNumber: number, key: string, value: any) => {
            if (key === "leader") {
                this.leader = value as string;
                this.emit("leader", this.leader);
                // console.log(`New leader elected: ${value}`);
            }
        });
        this.quorum.on("addProposal", (proposal: IPendingProposal) => {
            if (proposal.key === "leader") {
                if (this.leader !== undefined) {
                    proposal.reject();
                }
            }
        });

        this.quorum.on("removeMember", (removedClientId: string) => {
            if (this.leader === undefined || removedClientId === this.leader) {
                this.leader = undefined;
                this.quorum.propose("leader", this.clientId).then(() => {
                    // console.log(`Proposal accepted: ${this.clientId}!`);
                }, (err) => {
                    // console.log(`Error proposing new leadership: ${err}`);
                });
            }
        });

        this.quorum.on("rejectProposal", (sequenceNumber: number, key: string, value: any) => {
            // console.log(`Proposal rejected @${sequenceNumber}. ${key}:${value}`);
        });
    }
}
