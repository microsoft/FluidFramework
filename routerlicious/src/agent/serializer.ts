import * as assert from "assert";
import { SaveOperation } from "../api-core";
import { api, core } from "../client-api";

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;
const MaxTimeWithoutSnapshot = IdleDetectionTime * 12;
const SnapshotRetryTime = 1000;

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
 * Mananges snapshot creation for a distributed document
 */
export class Serializer {
    private lastSnapshotTime: number = -1;
    private idleTimer = null;
    private lastOp: core.ISequencedDocumentMessage = null;
    private lastSnapshotOp: core.ISequencedDocumentMessage = null;
    private lastOpSnapshotDetails: IOpSnapshotDetails = null;
    private snapshotting = false;

    constructor(private document: api.Document) {
    }

    public run(op: core.ISequencedDocumentMessage) {
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

    private snapshot(message: string, required: boolean) {
        this.snapshotting = true;

        // Otherwise pause the processing of inbound ops and then resume once the snapshot is complete
        console.log(`Snapshotting ${this.document.id}@${this.lastOp.sequenceNumber}`);
        this.document.deltaManager.inbound.pause();
        const snapshotP = this.document.snapshot(message).then(
            () => {
                // On succes note the last op and time of the snapshot. Skip on error to cause us to
                // attempt the snapshot again.
                this.lastSnapshotOp = this.lastOp;
                this.lastSnapshotTime = Date.now();
                return true;
            },
            (error) => {
                console.error(`Snapshotting error ${this.document.id}`, error);
                return false;
            });

        // If we were able to snapshot - or we failed but the snapshot wasn't required - then resume the inbound
        // message flow. Otherwise attempt the snapshot again
        snapshotP.then((success) => {
            if (!success && required) {
                setTimeout(() => this.snapshot(message, required), SnapshotRetryTime);
            } else {
                this.document.deltaManager.inbound.resume();
                this.snapshotting = false;
            }
        });
    }

    private getOpSnapshotDetails(op: core.ISequencedDocumentMessage): IOpSnapshotDetails {
        if (op.type === SaveOperation) {
            // Forced snapshot.
            const saveMessage = op.contents.message === null ? "" : `: ${op.contents.message}`;
            return {
                message: `;${op.clientId}${saveMessage}`,
                required: true,
                shouldSnapshot: true,
            };
        } else {
            // Snapshot if it has been above the max time between snapshots.
            const timeSinceLastSnapshot = Date.now() - this.lastSnapshotTime;
            return {
                message: "",
                required: false,
                shouldSnapshot: timeSinceLastSnapshot > MaxTimeWithoutSnapshot,
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
                if (!this.lastSnapshotOp || this.lastSnapshotOp.sequenceNumber !== this.lastOp.sequenceNumber) {
                    console.log("Snapshotting due to being idle");
                    this.snapshot(this.lastOpSnapshotDetails.message, this.lastOpSnapshotDetails.required);
                }
            },
            IdleDetectionTime);
    }
}
