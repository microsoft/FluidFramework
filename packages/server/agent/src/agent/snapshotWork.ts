/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHost } from "@microsoft/fluid-container-definitions";
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { BaseWork } from "./baseWork";
import { IWork } from "./definitions";
import { Serializer } from "./serializer";

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;
const MaxTimeWithoutSnapshot = IdleDetectionTime * 12;
const SnapshotRetryTime = 1000;

// Snapshot if 1000 ops received since last snapshot.
const MaxOpCountWithoutSnapshot = 1000;

export class SnapshotWork extends BaseWork implements IWork {
    private serializer: Serializer;
    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: any,
        private serviceFactory: IDocumentServiceFactory) {
        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, client: { type: "snapshot" } },
            this.serviceFactory,
            task);

        this.serializer = new Serializer(
            this.document,
            IdleDetectionTime,
            MaxTimeWithoutSnapshot,
            SnapshotRetryTime,
            MaxOpCountWithoutSnapshot);
        const eventHandler = (op: ISequencedDocumentMessage) => {
            this.serializer.run(op);
        };
        this.opHandler = eventHandler;
        this.document.on("op", eventHandler);

        return Promise.resolve();
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
