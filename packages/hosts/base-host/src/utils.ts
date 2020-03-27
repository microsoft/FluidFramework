/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPendingProposal, IQuorum } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";

export class UpgradeManager {
    private readonly quorum: IQuorum;
    private proposedSeqNum: number | undefined;

    constructor(private readonly runtime: IComponentRuntime) {
        this.log("initialized");
        this.quorum = this.runtime.getQuorum();
        this.quorum.on("addProposal", (proposal) => this.onAdd(proposal));
        this.quorum.on("approveProposal", (seqNum) => this.clear(seqNum));
        this.quorum.on("rejectProposal", (seqNum) => this.clear(seqNum));
    }

    private log(msg: string) {
        const trstr = this.proposedSeqNum ? `${this.proposedSeqNum}` : "empty";
        console.log(`UpMan (${this.runtime.clientId}, tracking: ${trstr}): ${msg}`);
    }

    private onAdd(proposal: IPendingProposal) {
        if (proposal.key !== "code") {
            return;
        }
        if (!this.proposedSeqNum) {
            this.log(`tracking ${proposal.sequenceNumber}`);
            this.proposedSeqNum = proposal.sequenceNumber;
        } else if (this.proposedSeqNum < proposal.sequenceNumber) {
            this.log(`rejecting ${proposal.sequenceNumber}`);
            proposal.reject();
        } else {
            this.log(`got older proposal (${proposal.sequenceNumber}!!!!!`);
        }
    }

    private clear(seqNum: number) {
        if (seqNum === this.proposedSeqNum) {
            this.proposedSeqNum = undefined;
        }
    }

    public upgrade(code) {
        if (this.proposedSeqNum) {
            this.log(`not proposing: already tracking ${this.proposedSeqNum}`);
            return;
        }
        this.log(`proposing @${this.runtime.deltaManager.referenceSequenceNumber}`);
        this.quorum.propose("code", code).then(
            () => this.log("local proposal approved"),
            () => this.log("local proposal rejected"));
    }
}
