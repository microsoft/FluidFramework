import * as api from "../api";

// Loads a document from DB.
export class Serializer {

    private pendingSerialize: boolean = false;
    private dirty: boolean = false;
    private lastSerializedMsn: number = 0;
    private currentMsn: number = 0;

    constructor(private root: api.ICollaborativeObject) {
    }

    public run(op: api.ISequencedMessage) {
        this.currentMsn = op.minimumSequenceNumber;
        this.snapshot();
    }

    private snapshot() {
        if (this.pendingSerialize) {
            this.dirty = true;
            return;
        }
        if (this.lastSerializedMsn >= this.currentMsn) {
            return;
        }

        // Set a pending operation and clear any dirty flags
        this.pendingSerialize = true;
        this.dirty = false;

        console.log(`Snapshotting ${this.root.id}`);
        const snapshotP = this.root.snapshot().catch((error) => {
                // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
                if (error) {
                    console.error(error);
                }
                return Promise.resolve();
            });

        // Finally clause to start snapshotting again once we finish
        snapshotP.then(() => {
            this.pendingSerialize = false;
            this.lastSerializedMsn = this.currentMsn;
            if (this.dirty) {
                this.snapshot();
            }
        });
    }
}
