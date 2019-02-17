import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { Runtime } from "@prague/runtime";
import { Serializer } from "./serializer";

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;
const MaxTimeWithoutSnapshot = IdleDetectionTime * 12;
const SnapshotRetryTime = 1000;

// Snapshot if 1000 ops received since last snapshot.
const MaxOpCountWithoutSnapshot = 1000;

export class Snapshotter {
    private serializer: Serializer;
    constructor(private runtime: Runtime) {
    }

    public start() {
        this.serializer = new Serializer(
            this.runtime,
            IdleDetectionTime,
            MaxTimeWithoutSnapshot,
            SnapshotRetryTime,
            MaxOpCountWithoutSnapshot);
        const eventHandler = (op: ISequencedDocumentMessage) => {
            this.serializer.run(op);
        };
        this.runtime.on("op", eventHandler);
    }
}
