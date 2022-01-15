/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IDeltaQueue } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { Container } from "./container";
import { debug } from "./debug";

const debugOp = debug.extend("ops");
const debugWait = debug.extend("wait");

export interface IContainerTracker {
    processIncoming(): Promise<void>;
    processOutgoing(): Promise<void>;
    pauseProcessing(): Promise<void>;
    resumeProcessing(): void;
}

export interface ContainerRecord {
    // Tracker paused state
    paused: boolean;

    // Tracking trailing no-op that may or may be acked by the server so we can discount them
    // See issue #5629
    startTrailingNoOps: number;
    trailingNoOps: number;

    // Track last proposal to ensure no unresolved proposal
    lastProposal: number;
}

export class ContainerTracker implements IContainerTracker {
    public containerRecord!: ContainerRecord;

    constructor(private readonly container: IContainer) {
        // ignore summarizer
        if (!this.container.deltaManager.clientDetails.capabilities.interactive) { return; }

        const record = {
            paused: false,
            startTrailingNoOps: 0,
            trailingNoOps: 0,
            lastProposal: 0,
        };
        this.containerRecord = record;
        this.trackTrailingNoOps();
        this.setupTrace(container);
    }

    /**
     * Reset the tracker, closing all containers and stop tracking them.
     */
    public reset() {
        this.container.close();
    }

    /**
     * Resume all queue activities on all paused tracked containers and return them
     */
    public resumeProcessing() {
        if (this.container.closed) { return; }
        if (this.containerRecord.paused) {
            debugWait(`Container resumed`);
            this.container.deltaManager.inbound.resume();
            this.container.deltaManager.outbound.resume();
            this.containerRecord.paused = false;
            return this.container;
        }
    }

    /**
     * Pause all queue activities on the containers given, or all tracked containers
     * Any containers given that is not tracked will be ignored.
     */
    public async pauseProcessing() {
        if (this.container.closed) { return; }
        if (!this.containerRecord.paused) {
            debugWait(`Container paused`);
            await this.container.deltaManager.inbound.pause();
            await this.container.deltaManager.outbound.pause();
            this.containerRecord.paused = true;
        }
    }

    /**
     * Setup debug traces for connection and ops
     */
    private setupTrace(container: IContainer) {
        if (debugOp.enabled) {
            const getContentsString = (type: string, msgContents: any) => {
                try {
                    if (type !== MessageType.Operation) {
                        if (typeof msgContents === "string") { return msgContents; }
                        return JSON.stringify(msgContents);
                    }
                    let address = "";

                    // contents comes in the wire as JSON string ("push" event)
                    // But already parsed when apply ("op" event)
                    let contents = typeof msgContents === "string" ?
                        JSON.parse(msgContents) : msgContents;
                    while (contents !== undefined && contents !== null) {
                        if (contents.contents?.address !== undefined) {
                            address += `/${contents.contents.address}`;
                            contents = contents.contents.contents;
                        } else if (contents.content?.address !== undefined) {
                            address += `/${contents.content.address}`;
                            contents = contents.content.contents;
                        } else {
                            break;
                        }
                    }
                    if (address) {
                        return `${address} ${JSON.stringify(contents)}`;
                    }
                    return JSON.stringify(contents);
                } catch (e: any) {
                    return `${e.message}: ${e.stack}`;
                }
            };
            debugOp(`ADD: clientId: ${(container as Container).clientId}`);
            container.deltaManager.outbound.on("op", (messages) => {
                for (const msg of messages) {
                    debugOp(`OUT:          `
                        + `cli: ${msg.clientSequenceNumber.toString().padStart(3)} `
                        + `rsq: ${msg.referenceSequenceNumber.toString().padStart(3)} `
                        + `${msg.type} ${getContentsString(msg.type, msg.contents)}`);
                }
            });
            const getInboundHandler = (type: string) => {
                return (msg: ISequencedDocumentMessage) => {
                    const clientSeq = msg.clientId === (container as Container).clientId ?
                        `cli: ${msg.clientSequenceNumber.toString().padStart(3)}` : "        ";
                    debugOp(`${type}: seq: ${msg.sequenceNumber.toString().padStart(3)} `
                        + `${clientSeq} min: ${msg.minimumSequenceNumber.toString().padStart(3)} `
                        + `${msg.type} ${getContentsString(msg.type, msg.contents)}`);
                };
            };
            container.deltaManager.inbound.on("push", getInboundHandler("IN "));
            container.deltaManager.inbound.on("op", getInboundHandler("OP "));
            container.deltaManager.on("connect", (details) => {
                debugOp(` CON: clientId: ${details.clientId}`);
            });
            container.deltaManager.on("disconnect", (reason) => {
                debugOp(`DIS: ${reason}`);
            });
        }
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * inbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
     public async processIncoming() {
        return this.processQueue((container) => container.deltaManager.inbound);
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * outbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
    public async processOutgoing() {
        return this.processQueue((container) => container.deltaManager.outbound);
    }

    /**
     * Implementation of processIncoming and processOutgoing
     */
    private async processQueue<U>(getQueue: (container: IContainer) => IDeltaQueue<U>) {
        await this.pauseProcessing();
        const resumed: IDeltaQueue<U>[] = [];

        const inflightTracker = new Map<IContainer, number>();
        const cleanup: (() => void)[] = [];
        const queue = getQueue(this.container);

        // track the outgoing ops (if any) to make sure they make the round trip to at least to the same client
        // to make sure they are sequenced.
        cleanup.push(this.setupInOutTracker(this.container, inflightTracker));
        queue.resume();
        resumed.push(queue);

        while (resumed.some((resumedQueue) => !resumedQueue.idle)) {
            debugWait("Wait until queue is idle");
            await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        }

        // Make sure all the op that we sent out are acked first
        // This is no op if we are processing incoming
        if (inflightTracker.size) {
            debugWait("Wait for inflight ops");
            do {
                await this.waitForAnyInboundOps();
            } while (inflightTracker.size);
        }

        // remove the handlers
        cleanup.forEach((clean) => clean());

        await Promise.all(resumed.map(async (resumedQueue) => resumedQueue.pause()));
    }

    /**
     * Utility to wait for any inbound ops from a set of containers
     * @param containersToApply - the set of containers to wait for any inbound ops for
     */
    public async waitForAnyInboundOps() {
        return new Promise<void>((resolve) => {
            const handler = () => {
                this.container.deltaManager.inbound.off("push", handler);
                resolve();
            };
            this.container.deltaManager.inbound.on("push", handler);
        });
    }

    /**
     * Utility to set up listener to track the outbound ops until it round trip back
     * Returns a function to remove the handler after it is done.
     *
     * @param container - the container to setup
     * @param inflightTracker - a map to track the clientSequenceNumber per container it expect to get ops back
     */
    private setupInOutTracker(container: IContainer, inflightTracker: Map<IContainer, number>) {
        const outHandler = (messages: IDocumentMessage[]) => {
            for (const message of messages) {
                if (message.type !== MessageType.NoOp) {
                    inflightTracker.set(container, message.clientSequenceNumber);
                }
            }
        };
        const inHandler = (message: ISequencedDocumentMessage) => {
            if (message.type !== MessageType.NoOp
                && message.clientId === (container as Container).clientId
                && inflightTracker.get(container) === message.clientSequenceNumber) {
                inflightTracker.delete(container);
            }
        };

        container.deltaManager.outbound.on("op", outHandler);
        container.deltaManager.inbound.on("push", inHandler);

        return () => {
            container.deltaManager.outbound.off("op", outHandler);
            container.deltaManager.inbound.off("push", inHandler);
        };
    }

    /**
     * Keep track of the trailing NoOp that was sent so we can discount them in the clientSequenceNumber tracking.
     * The server might coalesce them with other ops, or a single NoOp, or delay it if it don't think it is necessary.
     *
     * @param container - the container to track
     * @param record - the record to update the trailing op information
     */
    private trackTrailingNoOps() {
        this.container.deltaManager.outbound.on("op", (messages) => {
            for (const msg of messages) {
                if (msg.type === MessageType.NoOp) {
                    // Track the NoOp that was sent.
                    if (this.containerRecord.trailingNoOps === 0) {
                        // record the starting sequence number of the trailing no ops if we haven't been tracking yet.
                        this.containerRecord.startTrailingNoOps = msg.clientSequenceNumber;
                    }
                    this.containerRecord.trailingNoOps++;
                } else {
                    // Other ops has been sent. We would like to see those ack'ed, so no more need to track NoOps
                    this.containerRecord.trailingNoOps = 0;
                }
            }
        });

        this.container.deltaManager.inbound.on("push", (message) => {
            // Received the no op back, update the record if we are tracking
            if (message.type === MessageType.NoOp
                && message.clientId === this.container.clientId
                && this.containerRecord.trailingNoOps !== 0
                && this.containerRecord.startTrailingNoOps <= message.clientSequenceNumber
            ) {
                // NoOp might have coalesced and skipped ahead some sequence number
                // update the record and skip ahead as well
                const oldStartTrailingNoOps = this.containerRecord.startTrailingNoOps;
                this.containerRecord.startTrailingNoOps = message.clientSequenceNumber + 1;
                this.containerRecord.trailingNoOps -= (this.containerRecord.startTrailingNoOps - oldStartTrailingNoOps);
            }
        });

        this.container.on("disconnected", () => {
            // reset on disconnect.
            this.containerRecord.trailingNoOps = 0;
        });
    }
}
