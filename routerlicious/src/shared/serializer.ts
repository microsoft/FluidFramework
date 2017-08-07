import * as api from "../api";

// Loads a document from DB.
export class Serializer {

    private pendingSerialize: boolean = false;
    private dirty: boolean = false;

    constructor(private root: api.Document) {
    }

    public run() {
        if (this.pendingSerialize) {
            this.dirty = true;
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
            if (this.dirty) {
                this.run();
            }
        });
    }

}
