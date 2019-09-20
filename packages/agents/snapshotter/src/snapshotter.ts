/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { Serializer } from "./serializer";

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;
const MaxTimeWithoutSnapshot = IdleDetectionTime * 12;
const SnapshotRetryTime = 1000;

// Snapshot if 1000 ops received since last snapshot.
const MaxOpCountWithoutSnapshot = 1000;

export class Snapshotter {
    private serializer: Serializer | undefined;
    constructor(private readonly runtime: ContainerRuntime) {
    }

    public start() {
        this.serializer = new Serializer(
            this.runtime,
            IdleDetectionTime,
            MaxTimeWithoutSnapshot,
            SnapshotRetryTime,
            MaxOpCountWithoutSnapshot);
        const eventHandler = (op: ISequencedDocumentMessage) => {
            if (this.serializer) {
                this.serializer.run(op);
            }
        };
        this.runtime.on("op", eventHandler);
    }
}
