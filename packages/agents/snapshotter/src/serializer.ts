/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import * as assert from "assert";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ISequencedDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";

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

/**
 * Manages snapshot creation for a distributed document
 */
export class Serializer {
    // Use the current time on initialization since we will be loading off a snapshot
    private lastSnapshotTime: number = Date.now();
    private lastSnapshotSeqNumber: number = 0;
    private idleTimer: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;
    private lastOp: ISequencedDocumentMessage | null = null;
    private lastOpSnapshotDetails: IOpSnapshotDetails | null = null;
    private snapshotting = false;

    constructor(
        private readonly runtime: ContainerRuntime,
        private readonly idleTime: number,
        private readonly maxTimeWithoutSnapshot: number,
        private readonly retryTime: number,
        private readonly maxOpCountWithoutSnapshot: number) {
    }

    public run(op: ISequencedDocumentMessage) {
        assert(!this.snapshotting, "Op processing should be paused when a snapshot is happening");

        // Stop any idle processing
        this.clearIdleTimer();

        // Get the snapshot details for the given op
        this.lastOp = op;
        this.lastOpSnapshotDetails = this.getOpSnapshotDetails(op);

        if (this.lastOpSnapshotDetails.shouldSnapshot) {
            // Snapshot immediately if requested
            this.snapshot(this.lastOpSnapshotDetails.message, this.lastOpSnapshotDetails.required);
        } else {
            // Otherwise detect when we idle to trigger the snapshot
            this.startIdleTimer();
        }
    }

    public get isSnapshotting() {
        return this.snapshotting;
    }

    public stop() {
        this.clearIdleTimer();
        this.clearRetryTimer();
    }

    private snapshot(message: string, required: boolean) {
        this.snapshotting = true;

        // Otherwise pause the processing of inbound ops and then resume once the snapshot is complete
        console.log(`Snapshotting ${this.runtime.id}@${this.lastOp!.sequenceNumber}`);
        const pausedP = this.runtime.deltaManager.inbound.pause();
        const snapshotP = pausedP.then(async () => {
            try {
                await this.runtime.requestSnapshot(message);
                // On success note the time of the snapshot and op sequence number. Skip on error to cause us to
                // attempt the snapshot again.
                this.lastSnapshotTime = Date.now();
                this.lastSnapshotSeqNumber = this.lastOp!.sequenceNumber;
                return true;
            } catch (error) {
                console.error(`Snapshotting error ${this.runtime.id}`, error);
                return false;
            }
        });

        // If we were able to snapshot - or we failed but the snapshot wasn't required - then resume the inbound
        // message flow. Otherwise attempt the snapshot again
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        snapshotP.then(async (success) => {
            if (!success && required) {
                this.retryTimer = setTimeout(() => this.snapshot(message, required), this.retryTime);
            } else {
                this.snapshotting = false;
                this.runtime.deltaManager.inbound.resume();
            }
        });
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
                shouldSnapshot: (timeSinceLastSnapshot > this.maxTimeWithoutSnapshot) ||
                    (opCountSinceLastSnapshot > this.maxOpCountWithoutSnapshot),
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

    private clearRetryTimer() {
        if (!this.retryTimer) {
            return;
        }
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private startIdleTimer() {
        assert(!this.idleTimer);
        this.idleTimer = setTimeout(
            () => {
                console.log("Snapshotting due to being idle");
                this.snapshot(this.lastOpSnapshotDetails!.message, this.lastOpSnapshotDetails!.required);
            },
            this.idleTime);
    }
}
