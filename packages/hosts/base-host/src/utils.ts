/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { DebugLogger, Deferred, PromiseTimer, Timer } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { IPendingProposal, IQuorum, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

// subset of IHostRuntime used by UpgradeManager
export interface IUpgradeRuntime {
    getQuorum(): IQuorum;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
}

export interface IUpgradeFnConfig {
    maxTime?: number, // maximum time before proposing
    opTime?: number, // time without ops before proposing
    clients?: number, // propose if and when fewer than this number of interactive clients connected
}

const defaultUpgradeFnConfig = {
    maxTime: 30000,
    opTime: 10000,
    clients: 1,
};

async function defaultUpgradeFn(runtime: IUpgradeRuntime, config: IUpgradeFnConfig = defaultUpgradeFnConfig) {
    const promises: Promise<string>[] = [];

    if (config.maxTime) {
        promises.push(new PromiseTimer(config.maxTime, () => { }).start().then(() => "max time"));
    }

    if (config.opTime) {
        const opTime = config.opTime;
        promises.push(new Promise<string>((resolve) => {
            const timer = new Timer(opTime, () => resolve("no ops"));
            timer.start();
            runtime.on("op", () => timer.start());
        }));
    }

    if (config.clients) {
        const clients = config.clients;
        const clientCount = () => Array.from(runtime.getQuorum().getMembers().values())
            .filter((c) => c.client.details.capabilities.interactive).length;
        promises.push(new Promise<string>((resolve) => {
            if (clientCount() <= clients) {
                resolve("client count");
            } else {
                runtime.getQuorum().on("removeMember", () => {
                    if (clientCount() <= clients) {
                        resolve("client count");
                    }
                });
            }
        }));
    }

    if (promises.length === 0) {
        return Promise.reject("no upgrade parameters specified");
    }

    return Promise.race(promises);
}

export class UpgradeManager extends EventEmitter {
    private readonly logger: ITelemetryLogger;
    private proposedSeqNum: number | undefined;
    // details of a delayed low priority upgrade
    private delayed: { code: IFluidCodeDetails, result: Deferred<boolean> } | undefined;

    constructor(private readonly runtime: IUpgradeRuntime, logger?: ITelemetryBaseLogger) {
        super();
        this.logger = DebugLogger.mixinDebugLogger("fluid:telemetry:UpgradeManager", logger);
        runtime.getQuorum().on("addProposal", (proposal) => this.onAdd(proposal));
        runtime.getQuorum().on("approveProposal", (seqNum) => this.onApprove(seqNum));
        runtime.getQuorum().on("rejectProposal", (seqNum) => this.onReject(seqNum));
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
     * @param upgradeFn - returns a promise that will initiate a low priority upgrade on resolve
     * @param upgradeFnConfig - configure options for default upgradeFn
     */
    public async upgrade(
        code: IFluidCodeDetails,
        highPriority = false,
        upgradeFn?: (runtime: IUpgradeRuntime) => Promise<string>,
        upgradeFnConfig?: IUpgradeFnConfig,
    ): Promise<boolean> {
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

        this.logger.sendTelemetryEvent({
            eventName: "UpgradeDelayed",
            trackedSequenceNumber: this.proposedSeqNum,
        });

        this.delayed = { code, result: new Deferred<boolean>() };
        const upgradeP = upgradeFn ? upgradeFn(this.runtime) : defaultUpgradeFn(this.runtime, upgradeFnConfig);
        upgradeP.then(async (reason) => {
            if (this.delayed) {
                this.propose(this.delayed.code, reason).then(
                    (result) => this.delayed?.result.resolve(result),
                    (error) => this.delayed?.result.reject(error),
                );
                this.delayed = undefined;
            }
        }, (error) => {
            if (this.delayed) {
                this.delayed.result.reject(error);
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

        return this.runtime.getQuorum().propose("code", code).then(
            () => true,
            (error) => {
                // don't reject here on proposal rejection since it's expected, but reject on other promise rejections
                if (typeof error === "string" && error.startsWith("Rejected by ")) {
                    return false;
                }
                return Promise.reject(error);
            },
        );
    }
}
