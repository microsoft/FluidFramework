import * as queue from "async/queue";
import { SaveOperation } from "../api-core";
import { api, core } from "../client-api";

// Loads a document from DB.
export class Serializer {

    private currentMsn: number = -1;
    private snapshotRequested = false;
    private snapshotTimer: any = null;
    private saveQueue: any;
    private forceSaving: boolean = false;

    constructor(private document: api.Document) {
        // Snapshot queue to perform snapshots sequentially.
        this.saveQueue = queue((message: string, callback) => {
            this.forceSaving = true;
            const snapshotP = this.snapshot(message);
            snapshotP.then((result) => {
                this.forceSaving = false;
                callback();
            }, (error) => {
                this.forceSaving = false;
                callback();
            });
        }, 1);
    }

    public run(op: core.ISequencedDocumentMessage) {
        // Forced snapshot.
        if (op.type === SaveOperation) {
            const saveMessage = op.contents.message === null ? "" : `: ${op.contents.message}`;
            const tagMessage = `;${op.clientId}${saveMessage}`;
            this.saveQueue.push(tagMessage);
            return;
        }
        // Exit early in the case that the minimum sequence number hasn't changed
        if (this.currentMsn === op.minimumSequenceNumber) {
            return;
        }

        // Otherwise update the MSN and request a snapshot
        this.currentMsn = op.minimumSequenceNumber;
        this.requestSnapshot();
    }

    private requestSnapshot() {
        // TODO we probably want to split this into a strategy pattern around when to fire the snapshot
        // and/or create an intelligent agent that detects this and inserts a special value into the stream
        this.snapshotRequested = true;

        if (!this.snapshotTimer) {
            const snapshotRequestTime = Date.now();

            this.snapshotTimer = setInterval(() => {
                // capture the snapshot requested state and then clear it
                const snapshotRequested = this.snapshotRequested;
                this.snapshotRequested = false;

                // We will snapshot if no snapshot was requested within the interval (i.e. we idled) or we have
                // been waiting for a specified amount of time without being able to snapshot
                const delta = Date.now() - snapshotRequestTime;
                if ((!snapshotRequested || delta > 60000) && !this.forceSaving) {
                    // Stop the timer but don't clear the field to avoid anyone else starting the timer
                    clearInterval(this.snapshotTimer);
                    this.snapshot().then(() => {
                        this.snapshotTimer = null;
                        if (this.snapshotRequested) {
                            this.requestSnapshot();
                        }
                    });
                }
            },
            10000);
        }
    }

    /**
     * Performs the actual snapshot of the collaborative document
     */
    private snapshot(tagMessage: string = undefined) {
        console.log(`Snapshotting ${this.document.id}@${this.currentMsn}`);
        return this.document.snapshot(tagMessage).catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
            if (error) {
                console.error(`Error snapshotting ${this.document.id}`, error);
            }
        });
    }
}
