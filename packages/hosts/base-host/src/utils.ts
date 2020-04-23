/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { DebugLogger, Deferred, PromiseTimer, Timer } from "@microsoft/fluid-common-utils";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { IPendingProposal } from "@microsoft/fluid-protocol-definitions";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

export class UpgradeManager extends EventEmitter {
    private readonly logger: ITelemetryLogger;
    private proposedSeqNum: number | undefined;
    // details of a delayed low priority upgrade
    private delayed: { code: IFluidCodeDetails, result: Deferred<boolean> } | undefined;

    constructor(private readonly runtime: IHostRuntime, logger?: ITelemetryBaseLogger) {
        super();
        this.logger = DebugLogger.mixinDebugLogger("fluid:telemetry:UpgradeManager", logger);
        runtime.getQuorum().on("addProposal", (proposal) => this.onAdd(proposal));
        runtime.getQuorum().on("approveProposal", (seqNum) => this.onApprove(seqNum));
        runtime.getQuorum().on("rejectProposal", (seqNum) => this.onReject(seqNum));
    }

    /**
     * Number of human clients connected to a document
     */
    private get clients(): number {
        return Array.from(this.runtime.getQuorum().getMembers().values())
            .filter((c) => c.client.details.capabilities.interactive).length;
    }

    private onAdd(proposal: IPendingProposal) {
        if (proposal.key !== "code") {
            return;
        }
        if (!this.proposedSeqNum) {
            this.proposedSeqNum = proposal.sequenceNumber;
            this.emit("upgradeInProgress", this.proposedSeqNum);
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
            this.emit("upgradeSucceeded", this.proposedSeqNum);
            this.proposedSeqNum = undefined;
        }
    }

    private onReject(seqNum: number) {
        if (seqNum === this.proposedSeqNum) {
            // the proposal we're tracking was rejected, which probably means the upgrade failed
            this.logger.sendTelemetryEvent({ eventName: "UpgradeFailed", trackedSequenceNumber: this.proposedSeqNum });
            this.emit("upgradeFailed", this.proposedSeqNum);
            this.proposedSeqNum = undefined;
        }
    }

    /**
     * Initiate an upgrade.
     * @param code - code details for upgrade
     * @param highPriority - If true, propose upgrade immediately. If false, wait for an opportune time to upgrade.
     */
    public async upgrade(code: IFluidCodeDetails, highPriority = false): Promise<boolean> {
        // if we get a high priority upgrade we cancel the low priority upgrade if it exists
        if (highPriority) {
            this.delayed?.result.resolve(false);
            this.delayed = undefined;
            return this.propose(code, "high priority");
        }

        // if we get a second low priority upgrade() call just update the code
        if (this.delayed) {
            this.delayed.code = code;
            return this.delayed.result.promise;
        }

        const maxTime = 30000; // maximum time before proposing
        const opTime = 10000; // time without ops before proposing

        const maxTimeP = new PromiseTimer(maxTime, () => { }).start().then(() => "max time");
        const onlyOneClientP = new Promise<string>((resolve) => {
            if (this.clients === 1) {
                resolve("one client");
            } else {
                this.runtime.getQuorum().on("removeMember", () => {
                    if (this.clients === 1) {
                        resolve("one client");
                    }
                });
            }
        });
        const noOpsP = new Promise<string>((resolve) => {
            const timer = new Timer(opTime, () => resolve("no ops"));
            timer.start();
            this.runtime.on("op", () => timer.start());
        });

        this.delayed = { code, result: new Deferred<boolean>() };
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.race([maxTimeP, onlyOneClientP, noOpsP]).then(async (reason) => {
            if (this.delayed) {
                this.delayed.result.resolve(this.propose(this.delayed.code, reason));
                this.delayed = undefined;
            }
        });
        return this.delayed.result.promise;
    }

    private async propose(code: IFluidCodeDetails, reason: string): Promise<boolean> {
        this.logger.sendTelemetryEvent({
            eventName: "UpgradeStarted",
            trackedSequenceNumber: this.proposedSeqNum,
            reason,
        });

        // don't reject here on proposal rejection since it's expected for all but one client
        return this.runtime.getQuorum().propose("code", code).then(
            () => true,
            () => false,
        );
    }
}
