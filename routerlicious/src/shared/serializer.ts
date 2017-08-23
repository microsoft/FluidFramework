import * as api from "../api";

// Loads a document from DB.
export class Serializer {

    private currentMsn: number = -1;
    private snapshotRequested = false;
    private snapshotTimer: any = null;

    constructor(private document: api.Document) {
    }

    public run(op: api.ISequencedDocumentMessage) {
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
                if (!snapshotRequested || delta > 60000) {
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
    private snapshot() {
        console.log(`Snapshotting ${this.document.id}@${this.currentMsn}`);
        return this.document.snapshot().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
            if (error) {
                console.error(`Error snapshotting ${this.document.id}`, error);
            }
        });
    }
}
