/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainer, IDeltaManager } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ConnectionState } from "./connectionState";

/** @see ICatchUpMonitor for usage */
type CaughtUpListener = (hasCheckpointSequenceNumber: boolean) => void;

/** @see ICatchUpMonitor for usage */
export interface ICatchUpMonitorEvents extends IEvent {
    (event: "caughtUp", listener: CaughtUpListener): void;
}

/** Monitor that emits an event when a Container has caught up to a given point in the op stream */
export interface ICatchUpMonitor extends TypedEventEmitter<ICatchUpMonitorEvents>, IDisposable { }

/**
 * Monitors the given Container and notifies listeners when the Container has processed all ops
 * known at the time the monitor was created.
 */
export class CatchUpMonitor extends TypedEventEmitter<ICatchUpMonitorEvents> implements ICatchUpMonitor {
    private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    private readonly hasCheckpointSequenceNumber: boolean;
    private readonly targetSeqNumber: number;
    private caughtUp: boolean = false;

    private readonly opHandler = (message: Pick<ISequencedDocumentMessage, "sequenceNumber">) => {
        if (!this.caughtUp && message.sequenceNumber >= this.targetSeqNumber) {
            this.caughtUp = true;
            this.emit("caughtUp", this.hasCheckpointSequenceNumber);
        }
    };

    /**
     * Create the CatchUpMonitor, setting the target sequence number to wait for based on DeltaManager's current state.
     */
    constructor(
        container: IContainer,
    ) {
        super();

        assert(container.connectionState !== ConnectionState.Disconnected,
            0x0cd /* "Container disconnected while waiting for ops!" */);

        this.deltaManager = container.deltaManager;
        this.hasCheckpointSequenceNumber = this.deltaManager.hasCheckpointSequenceNumber;
        this.targetSeqNumber = this.deltaManager.lastKnownSeqNumber;

        assert(this.targetSeqNumber >= this.deltaManager.lastSequenceNumber,
            0x266 /* "Cannot wait for seqNumber below last processed sequence number" */);

        this.deltaManager.on("op", this.opHandler);

        // Simulate the last processed op
        this.opHandler({ sequenceNumber: this.deltaManager.lastSequenceNumber });

        // If a listener is added but before that point we caught up, notify that new listener immediately
        this.on("newListener", (event: string, listener) => {
            if (event === "caughtUp") {
                const caughtUpListener = listener as CaughtUpListener;
                if (this.caughtUp) {
                    caughtUpListener(this.hasCheckpointSequenceNumber);
                }
            }
        });
    }

    public disposed: boolean = false;
    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        this.removeAllListeners();
        this.deltaManager.off("op", this.opHandler);
    }
}

/** Monitor that always notifies listeners immediately, passing false for hasCheckpointSequenceNumber arg */
export class ImmediateCatchUpMonitor extends TypedEventEmitter<ICatchUpMonitorEvents> implements ICatchUpMonitor {
    constructor() {
        super();
        this.on("newListener", (event: string, listener) => {
            if (event === "caughtUp") {
                const caughtUpListener = listener as CaughtUpListener;
                caughtUpListener(false /* hasCheckpointSequenceNumber */);
            }
        });
    }

    public disposed: boolean = false;
    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        this.removeAllListeners();
    }
}
