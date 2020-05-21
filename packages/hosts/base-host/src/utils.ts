/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { DebugLogger } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { IPendingProposal, IQuorum } from "@microsoft/fluid-protocol-definitions";

export class UpgradeManager extends EventEmitter {
    private proposedSeqNum: number | undefined;
    private readonly logger: ITelemetryLogger;

    constructor(private readonly quorum: IQuorum, logger?: ITelemetryBaseLogger) {
        super();
        this.logger = DebugLogger.mixinDebugLogger("fluid:telemetry:UpgradeManager", logger);
        quorum.on("addProposal", (proposal) => this.onAdd(proposal));
        quorum.on("approveProposal", (seqNum) => this.onApprove(seqNum));
        quorum.on("rejectProposal", (seqNum) => this.onReject(seqNum));
    }

    private onAdd(proposal: IPendingProposal) {
        if (proposal.key !== "code") {
            return;
        }
        if (!this.proposedSeqNum) {
            this.proposedSeqNum = proposal.sequenceNumber;
            this.emit("upgradeInProgress");
        } else if (this.proposedSeqNum < proposal.sequenceNumber) {
            proposal.reject();
        } else {
            // The proposal we're tracking is not the first. It should've been rejected but we missed our chance.
            this.logger.sendErrorEvent({
                eventName: "ProposalOutOfOrder",
                trackedSequenceNumber: this.proposedSeqNum,
                olderSequenceNumber: proposal.sequenceNumber,
            });
            this.proposedSeqNum = undefined;
        }
    }

    private onApprove(seqNum: number) {
        if (seqNum === this.proposedSeqNum) {
            this.logger.sendTelemetryEvent({
                eventName: "UpgradeSucceeded",
                trackedSequenceNumber: this.proposedSeqNum,
            });
            this.emit("upgradeSucceeded");
            this.proposedSeqNum = undefined;
        }
    }

    private onReject(seqNum: number) {
        if (seqNum === this.proposedSeqNum) {
            // the proposal we're tracking was rejected, which probably means the upgrade failed
            this.logger.sendTelemetryEvent({ eventName: "UpgradeFailed", trackedSequenceNumber: this.proposedSeqNum });
            this.emit("upgradeFailed");
            this.proposedSeqNum = undefined;
        }
    }

    public async upgrade(code: IFluidCodeDetails) {
        if (this.proposedSeqNum) {
            // don't propose if we know there's already one pending
            this.logger.sendTelemetryEvent({
                eventName: "SkippedProposal",
                trackedSequenceNumber: this.proposedSeqNum,
            });
            return;
        }

        return this.quorum.propose("code", code).then(
            () => true,
            () => false,
        );
    }
}
