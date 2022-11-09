/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/** @see CatchUpMonitor for usage */
type CaughtUpListener = () => void;

/** Monitor that emits an event when a Container has caught up to a given point in the op stream */
export type ICatchUpMonitor = IDisposable;

/**
 * Monitors a Container's DeltaManager, notifying listeners when all ops have been processed
 * that were known at the time the monitor was created.
 */
export class CatchUpMonitor implements ICatchUpMonitor {
    private readonly targetSeqNumber: number;
    private caughtUp: boolean = false;

    private readonly opHandler = (message: Pick<ISequencedDocumentMessage, "sequenceNumber">) => {
        if (!this.caughtUp && message.sequenceNumber >= this.targetSeqNumber) {
            this.caughtUp = true;
            this.listener();
        }
    };

    /**
     * Create the CatchUpMonitor, setting the target sequence number to wait for based on DeltaManager's current state.
     */
    constructor(
        private readonly deltaManager: IDeltaManager<any, any>,
        private readonly listener: CaughtUpListener,
    ) {
        this.targetSeqNumber = this.deltaManager.lastKnownSeqNumber;

        assert(this.targetSeqNumber >= this.deltaManager.lastSequenceNumber,
            0x37c /* Cannot wait for seqNumber below last processed sequence number */);

        this.deltaManager.on("op", this.opHandler);

        // Simulate the last processed op to set caughtUp in case we already are
        this.opHandler({ sequenceNumber: this.deltaManager.lastSequenceNumber });
    }

    public disposed: boolean = false;
    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        this.deltaManager.off("op", this.opHandler);
    }
}
