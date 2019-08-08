/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
} from "@prague/component-core-interfaces";
import {
    ISequencedDocumentMessage,
    ISummaryConfiguration,
    MessageType,
} from "@prague/protocol-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { ContainerRuntime } from "./containerRuntime";
import { debug } from "./debug";

/**
 * Wrapper interface holding snapshot details for a given op
 */
interface IOpSnapshotDetails {
    // Whether we should snapshot at the given op
    shouldSnapshot: boolean;

    // The message to include with the snapshot
    message: string;

    // Whether creating the snapshot at this op is required
    required: boolean;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        readonly ISummarizer?: ISummarizer;
    }
}

export interface ISummarizer {
    readonly ISummarizer: ISummarizer;
    /**
     * Runs the summarizer on behalf of another clientId. In this case it will only run so long as the given
     * clientId is the elected summarizer and will stop once it is not.
     */
    run(onBehalfOf: string): Promise<void>;
}

export class Summarizer implements IComponentLoadable, ISummarizer {

    public get ISummarizer() { return this; }
    public get IComponentLoadable() { return this; }

    // Use the current time on initialization since we will be loading off a snapshot
    private lastSnapshotTime: number = Date.now();
    private lastSnapshotSeqNumber: number = 0;
    private idleTimer: NodeJS.Timeout | null = null;
    private lastOp: ISequencedDocumentMessage | null = null;
    private lastOpSnapshotDetails: IOpSnapshotDetails | null = null;
    private readonly runDeferred = new Deferred<void>();

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configuration: ISummaryConfiguration,
        private readonly generateSummary: () => Promise<void>,
    ) {
        this.runtime.on("disconnected", () => {
            this.runDeferred.resolve();
        });
    }

    public async run(onBehalfOf: string): Promise<void> {
        debug(`Summarizing on behalf of ${onBehalfOf}`);

        if (!this.runtime.connected) {
            await new Promise((resolve) => this.runtime.once("connected", resolve));
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            return;
        }

        this.runtime.on("op", (op: ISequencedDocumentMessage) => {
            this.clearIdleTimer();

            // Get the snapshot details for the given op
            this.lastOp = op;
            this.lastOpSnapshotDetails = this.getOpSnapshotDetails(op);

            if (this.lastOpSnapshotDetails.shouldSnapshot) {
                // Snapshot immediately if requested
                this.summarize(this.lastOpSnapshotDetails.message, this.lastOpSnapshotDetails.required);
            } else {
                // Otherwise detect when we idle to trigger the snapshot
                this.startIdleTimer();
            }
        });

        return this.runDeferred.promise;
    }

    private summarize(message: string, required: boolean) {
        // Otherwise pause the processing of inbound ops and then resume once the snapshot is complete
        debug(`Snapshotting ${this.runtime.id}@${this.lastOp.sequenceNumber}`);

        const snapshotP = this.generateSummary().then(
            () => {
                // On success note the time of the snapshot and op sequence number. Skip on error to cause us to
                // attempt the snapshot again.
                this.lastSnapshotTime = Date.now();
                this.lastSnapshotSeqNumber = this.lastOp.sequenceNumber;
                return true;
            },
            (error) => {
                debug(`Snapshotting error ${this.runtime.id}`, error);
                return false;
            });

        snapshotP.catch((error) => this.runDeferred.reject(error));
    }

    private getOpSnapshotDetails(op: ISequencedDocumentMessage): IOpSnapshotDetails {
        if (op.type === MessageType.Save) {
            // Forced snapshot.
            return {
                message: `;${op.clientId}: ${op.contents}`,
                required: true,
                shouldSnapshot: true,
            };
        } else {
            // Snapshot if it has been above the max time between snapshots.
            const timeSinceLastSnapshot = Date.now() - this.lastSnapshotTime;
            const opCountSinceLastSnapshot = op.sequenceNumber - this.lastSnapshotSeqNumber;
            return {
                message: "",
                required: false,
                shouldSnapshot: (timeSinceLastSnapshot > this.configuration.maxTime) ||
                                (opCountSinceLastSnapshot > this.configuration.maxOps),
            };
        }
    }

    private clearIdleTimer() {
        if (!this.idleTimer) {
            return;
        }
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private startIdleTimer() {
        assert(!this.idleTimer);
        this.idleTimer = setTimeout(
            () => {
                debug("Snapshotting due to being idle");
                this.summarize(this.lastOpSnapshotDetails.message, this.lastOpSnapshotDetails.required);
            },
            this.configuration.idleTime);
    }
}
