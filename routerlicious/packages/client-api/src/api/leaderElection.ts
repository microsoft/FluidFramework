import { IPendingProposal, IQuorum } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class LeaderElector extends EventEmitter {

    private leader: string;
    constructor(private quorum: IQuorum, private clientId: string) {
        super();
        quorum.on("approveProposal", this.setLeader);
        quorum.on("addProposal", this.handleLeadership);
        quorum.on("removeMember", this.checkLeadership);
        quorum.on("rejectProposal", this.handleRejection);
        this.checkLeadership();
    }

    public getLeader() {
        return this.leader;
    }

    private setLeader(sequenceNumber: number, key: string, value: any) {
        if (key === "leader") {
            this.leader = value as string;
            this.emit("leader", value);
            console.log(`New leader elected: ${value}`);
        }
    }

    private handleLeadership(proposal: IPendingProposal) {
        if (proposal.key === "leader") {
            if (this.leader !== undefined) {
                proposal.reject();
            }
        }
    }

    private checkLeadership(removedClientId?: string) {
        if (this.leader === undefined || removedClientId === this.leader) {
            this.leader = undefined;
            this.proposeLeadership().then(() => {
                console.log(`Successfully propsed!`);
            }, (err) => {
                console.log(`Error proposing new leadership`);
            });
        }
    }

    private async proposeLeadership() {
        return this.quorum.propose("leader", this.clientId);
    }

    private handleRejection(sequenceNumber: number, key: string, value: any) {
        console.log(`Proposal rejected @${sequenceNumber}. ${key}:${value}`);
    }
}
