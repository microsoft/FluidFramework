/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IChannelAttributes, IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { SharedObject } from "@microsoft/fluid-shared-object-base";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import {
    ConsensusCallback,
    ConsensusResult,
    IConsensusOrderedCollection,
    IOrderedCollection,
} from "./interfaces";

const snapshotFileNameData = "header";
const snapshotFileNameTracking = "jobTracking";

interface IConsensusOrderedCollectionValue<T> {
    // an ID used to indicate acquired item.
    // Used in acquire/release/complete ops.
    readonly acquireId: string;

    // The actual value
    readonly value: T;
}

/**
 * An operation for consensus ordered collection
 */
interface IConsensusOrderedCollectionAddOperation {
    opName: "add";
    // serialized value
    value: string;
}

interface IConsensusOrderedCollectionAcquireOperation {
    opName: "acquire";
    // an ID used to indicate acquired item.
    // Used in acquire/release/complete ops.
    acquireId: string;
}

interface IConsensusOrderedCollectionCompleteOperation {
    opName: "complete";
    // an ID used to indicate acquired item.
    // Used in acquire/release/complete ops.
    acquireId: string;
}

interface IConsensusOrderedCollectionReleaseOperation {
    opName: "release";
    // an ID used to indicate acquired item.
    // Used in acquire/release/complete ops.
    acquireId: string;
}

type IConsensusOrderedCollectionOperation =
    IConsensusOrderedCollectionAddOperation |
    IConsensusOrderedCollectionAcquireOperation |
    IConsensusOrderedCollectionCompleteOperation |
    IConsensusOrderedCollectionReleaseOperation;

/**
 * A record of the pending operation
 */
interface IPendingRecord<T> {
    /**
     * The resolve function to call after the operation is ack'ed
     */
    resolve: (value: IConsensusOrderedCollectionValue<T> | undefined) => void;

    /**
     * The client sequence number of the operation. For assert only.
     */
    clientSequenceNumber: number;

    /**
     * The original operation message. For assert only.
     */
    message: IConsensusOrderedCollectionOperation;
}

type jobTrackingType<T> = Map<string, {value: T, clientId: string | undefined}>;
const belongsToUnattached = undefined;

/**
 * Implementation of a consensus collection shared object
 *
 * Generally not used directly. A derived type will pass in a backing data type
 * IOrderedCollection that will define the deterministic add/acquire order and snapshot ability.
 * Implements the shared object's communication, handles the sending/processing
 * operations, provides the asynchronous API and manage the promise resolution.
 */
export class ConsensusOrderedCollection<T = any> extends SharedObject implements IConsensusOrderedCollection<T> {
    private readonly promiseResolveQueue: IPendingRecord<T>[] = [];

    private jobTracking: jobTrackingType<T> = new Map();

    /**
     * Constructs a new consensus collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    protected constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes: IChannelAttributes,
        private readonly data: IOrderedCollection<T>,
    ) {
        super(id, runtime, attributes);

        // It's likely not safe to call this.removeClient(this.runtime.clientId) in here
        // The fact that client recorded disconnect does not mean much in terms of the order
        // server will record disconnects from multiple clients. And order matters because
        // it defines the order items go back to the queue.
        // So we put items back to queue only when we process our own removeMember event.
        /*
        runtime.on("disconnected", () => {
            this.removeClient(this.runtime.clientId);
        });
        */

        runtime.getQuorum().on("removeMember", (clientId: string) => {
            assert(clientId);
            this.removeClient(clientId);
        });
    }

    /**
     * Add a value to the consensus collection.
     */
    public async add(value: T): Promise<void> {
        const valueSer = this.serializeValue(value);

        if (this.isLocal()) {
            // For the case where this is not attached yet, explicitly JSON
            // clone the value to match the behavior of going thru the wire.
            const addValue = this.deserializeValue(valueSer) as T;
            this.addCore(addValue);
            return Promise.resolve();
        }

        const op: IConsensusOrderedCollectionAddOperation = {
            opName: "add",
            value: valueSer,
        };
        await this.submit(op);
    }

    /**
     * Remove a value from the consensus collection.  If the collection is empty, returns false.
     * Otherwise calls callback with the value
     */
    public async acquire(callback: ConsensusCallback<T>): Promise<boolean> {
        const result = await this.acquireInternal();
        if (result === undefined) {
            return false;
        }

        const res = await callback(result.value);

        switch (res) {
            case ConsensusResult.Complete:
                await this.complete(result.acquireId);
                break;
            case ConsensusResult.Release:
                this.release(result.acquireId);
                this.emit("localRelease", result.value, true /*intentional*/);
                break;
            default:
                assert(false);
        }

        return true;
    }

    /**
     * Wait for a value to be available and acquire it from the consensus collection
     */
    public async waitAndAcquire(callback: ConsensusCallback<T>): Promise<void> {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.data.size() === 0) {
                // Wait for new entry before trying to acquire again
                await new Promise((resolve) => {
                    this.once("add", resolve);
                });
            }

            const res = await this.acquire(callback);
            if (res) {
                return;
            }
        }
    }

    public snapshot(): ITree {
        // If we are transitioning from unattached to attached mode, then we are loosing
        // all checked out work!
        this.removeClient(belongsToUnattached);

        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileNameData,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.serializeValue(this.data.asArray()),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        tree.entries.push({
            mode: FileMode.File,
            path: snapshotFileNameTracking,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: this.serializeValue(Array.from(this.jobTracking.entries())),
                encoding: "utf-8",
            }});
        return tree;
    }

    protected isActive() {
        return this.runtime.connected && this.runtime.deltaManager.active;
    }

    protected async complete(acquireId: string) {
        if (this.isLocal()) {
            this.completeCore(acquireId);
            return;
        }

        // if not active, this item already was released to queue (as observed by other clients)
        if (this.isActive()) {
            const work: IConsensusOrderedCollectionCompleteOperation = {
                opName: "complete",
                acquireId,
            };
            await this.submit(work);
        }
    }

    protected completeCore(acquireId: string) {
        // Note: item may be no longer in jobTracking and returned back to queue!
        const rec = this.jobTracking.get(acquireId);
        if (rec !== undefined) {
            this.jobTracking.delete(acquireId);
            this.emit("complete", rec.value);
        }
    }

    protected release(acquireId: string) {
        if (this.isLocal()) {
            this.releaseCore(acquireId);
            return;
        }

        // if not active, this item already was released to queue (as observed by other clients)
        if (this.isActive()) {
            const work: IConsensusOrderedCollectionReleaseOperation = {
                opName: "release",
                acquireId,
            };
            this.submit(work).catch((error) => {
                this.runtime.logger.sendErrorEvent({eventName: "ConsensusQueue_release"}, error);
            });
        }
    }

    protected releaseCore(acquireId: string) {
        // Note: item may be no longer in jobTracking and returned back to queue!
        const rec = this.jobTracking.get(acquireId);
        if (rec !== undefined) {
            this.jobTracking.delete(acquireId);
            this.data.add(rec.value);
            this.emit("add", rec.value, false /*newlyAdded*/);
        }
    }

    protected onConnect(pending: any[]) {
        // resubmit non-acked messages
        for (const record of this.promiseResolveQueue) {
            record.clientSequenceNumber = this.submitLocalMessage(record.message);
        }
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        assert(this.jobTracking.size === 0);
        const rawContentTracking = await storage.read(snapshotFileNameTracking);
        if (rawContentTracking !== undefined) {
            const content = this.deserializeValue(fromBase64ToUtf8(rawContentTracking));
            this.jobTracking = new Map(content) as jobTrackingType<T>;
        }

        assert(this.data.size() === 0);
        const rawContentData = await storage.read(snapshotFileNameData);
        if (rawContentData !== undefined) {
            const content = this.deserializeValue(fromBase64ToUtf8(rawContentData)) as T[];
            this.data.loadFrom(content);
        }
    }

    protected registerCore() {
        return;
    }

    protected onDisconnect() {
        for (const [, {value, clientId}] of this.jobTracking) {
            if (clientId === this.runtime.clientId) {
                this.emit("localRelease", value, false /*intentional*/);
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            const op: IConsensusOrderedCollectionOperation = message.contents;
            let value: IConsensusOrderedCollectionValue<T> | undefined;
            switch (op.opName) {
                case "add":
                    this.addCore(this.deserializeValue(op.value) as T);
                    break;

                case "acquire":
                    value = this.acquireCore(op.acquireId, message.clientId);
                    break;

                case "complete":
                    this.completeCore(op.acquireId);
                    break;

                case "release":
                    this.releaseCore(op.acquireId);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
            // If it is local operation, resolve the promise.
            if (local) {
                this.processLocalMessage(message, value);
            }
        }
    }

    /**
     * Resolve the promise of a local operation
     *
     * @param message - the message of the operation
     * @param value - the value related to the operation
     */
    private processLocalMessage(
        message: ISequencedDocumentMessage,
        value: IConsensusOrderedCollectionValue<T> | undefined)
    {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pending = this.promiseResolveQueue.shift()!;
        assert(pending);
        assert(message.contents.opName === pending.message.opName);
        assert(message.clientSequenceNumber === pending.clientSequenceNumber);
        pending.resolve(value);
    }

    private async submit(
        message: IConsensusOrderedCollectionOperation): Promise<IConsensusOrderedCollectionValue<T> | undefined> {

        assert(!this.isLocal());

        const clientSequenceNumber = this.submitLocalMessage(message);
        return new Promise((resolve) => {
            // Note that clientSequenceNumber and message is only used for asserts and isn't strictly necessary.
            this.promiseResolveQueue.push({ resolve, clientSequenceNumber, message });
        });
    }

    private addCore(value: T) {
        this.data.add(value);
        this.emit("add", value, true /*newlyAdded*/);
    }

    private acquireCore(acquireId: string, clientId?: string): IConsensusOrderedCollectionValue<T> | undefined {
        if (this.data.size() === 0) {
            return undefined;
        }
        const value = this.data.remove();

        const value2: IConsensusOrderedCollectionValue<T> = {
            acquireId,
            value,
        };
        this.jobTracking.set(value2.acquireId, {value, clientId});

        this.emit("acquire", value, clientId);
        return value2;
    }

    private async acquireInternal(): Promise<IConsensusOrderedCollectionValue<T> | undefined> {
        if (this.isLocal()) {
            // can be undefined if queue is empty
            const value = this.acquireCore(uuid(), belongsToUnattached);
            return Promise.resolve(value);
        }

        const op: IConsensusOrderedCollectionOperation = {
            opName: "acquire",
            acquireId: uuid(),
        };
        return this.submit(op);
    }

    private removeClient(clientIdToRemove?: string) {
        const added: T[] = [];
        for (const [acquireId, {value, clientId}] of this.jobTracking) {
            if (clientId === clientIdToRemove) {
                this.jobTracking.delete(acquireId);
                this.data.add(value);
                added.push(value);
            }
        }

        // Raise all events only after all state changes are completed,
        // to guarantee same ordering of operations if collection is manipulated from events.
        added.map((value) => this.emit("add", value, false /*newlyAdded*/));
    }

    private serializeValue(value) {
        return this.runtime.IComponentSerializer.stringify(
            value,
            this.runtime.IComponentHandleContext,
            this.handle);
    }

    private deserializeValue(content: string) {
        return this.runtime.IComponentSerializer.parse(
            content,
            this.runtime.IComponentHandleContext);
    }
}
