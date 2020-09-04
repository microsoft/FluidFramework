/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { fromBase64ToUtf8, unreachableCase } from "@fluidframework/common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
import { v4 as uuid } from "uuid";
import {
    ConsensusCallback,
    ConsensusResult,
    IConsensusOrderedCollection,
    IOrderedCollection,
    IConsensusOrderedCollectionEvents,
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

/** The type of the resolve function to call after the local operation is ack'd */
type PendingResolve<T> = (value: IConsensusOrderedCollectionValue<T> | undefined) => void;

/**
 * For job tracking, we need to keep track of which client "owns" a given value.
 * Key is the acquireId from when it was acquired
 * Value is the acquired value, and the id of the client who acquired it, or undefined for unattached client
 */
type JobTrackingInfo<T> = Map<string, { value: T, clientId: string | undefined }>;
const idForLocalUnattachedClient = undefined;

/**
 * Implementation of a consensus collection shared object
 *
 * Implements the shared object's communication, and the semantics around the
 * release/complete mechanism following acquire.
 *
 * Generally not used directly. A derived type will pass in a backing data type
 * IOrderedCollection that will define the deterministic add/acquire order and snapshot ability.
 */
export class ConsensusOrderedCollection<T = any>
    extends SharedObject<IConsensusOrderedCollectionEvents<T>> implements IConsensusOrderedCollection<T> {
    /**
     * The set of values that have been acquired but not yet completed or released
     */
    private jobTracking: JobTrackingInfo<T> = new Map();

    /**
     * Constructs a new consensus collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    protected constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        private readonly data: IOrderedCollection<T>,
    ) {
        super(id, runtime, attributes);

        // We can't simply call this.removeClient(this.runtime.clientId) in on runtime disconnected,
        // because other clients may disconnect concurrently.
        // Disconnect order matters because it defines the order items go back to the queue.
        // So we put items back to queue only when we process our own removeMember event.
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

        if (!this.isAttached()) {
            // For the case where this is not attached yet, explicitly JSON
            // clone the value to match the behavior of going thru the wire.
            const addValue = this.deserializeValue(valueSer) as T;
            this.addCore(addValue);
            return;
        }

        await this.submit<IConsensusOrderedCollectionAddOperation>({
            opName: "add",
            value: valueSer,
        });
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
                this.emit("localRelease", result.value, true /* intentional */);
                break;
            default: unreachableCase(res);
        }

        return true;
    }

    /**
     * Wait for a value to be available and acquire it from the consensus collection
     */
    public async waitAndAcquire(callback: ConsensusCallback<T>): Promise<void> {
        do {
            if (this.data.size() === 0) {
                // Wait for new entry before trying to acquire again
                await this.newAckBasedPromise((resolve) => {
                    this.once("add", resolve);
                });
            }
        } while (!(await this.acquire(callback)));
    }

    public snapshot(): ITree {
        // If we are transitioning from unattached to attached mode,
        // then we are losing all checked out work!
        this.removeClient(idForLocalUnattachedClient);

        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileNameData,
                    type: TreeEntry.Blob,
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
            type: TreeEntry.Blob,
            value: {
                contents: this.serializeValue(Array.from(this.jobTracking.entries())),
                encoding: "utf-8",
            },
        });
        return tree;
    }

    protected isActive() {
        return this.runtime.connected && this.runtime.deltaManager.active;
    }

    protected async complete(acquireId: string) {
        if (!this.isAttached()) {
            this.completeCore(acquireId);
            return;
        }

        // if not active, this item already was released to queue (as observed by other clients)
        if (this.isActive()) {
            await this.submit<IConsensusOrderedCollectionCompleteOperation>({
                opName: "complete",
                acquireId,
            });
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
        if (!this.isAttached()) {
            this.releaseCore(acquireId);
            return;
        }

        // if not active, this item already was released to queue (as observed by other clients)
        if (this.isActive()) {
            this.submit<IConsensusOrderedCollectionReleaseOperation>({
                opName: "release",
                acquireId,
            }).catch((error) => {
                this.runtime.logger.sendErrorEvent({ eventName: "ConsensusQueue_release" }, error);
            });
        }
    }

    protected releaseCore(acquireId: string) {
        // Note: item may be no longer in jobTracking and returned back to queue!
        const rec = this.jobTracking.get(acquireId);
        if (rec !== undefined) {
            this.jobTracking.delete(acquireId);
            this.data.add(rec.value);
            this.emit("add", rec.value, false /* newlyAdded */);
        }
    }

    protected async loadCore(
        branchId: string | undefined,
        storage: IChannelStorageService): Promise<void> {
        assert(this.jobTracking.size === 0);
        const rawContentTracking = await storage.read(snapshotFileNameTracking);
        if (rawContentTracking !== undefined) {
            const content = this.deserializeValue(fromBase64ToUtf8(rawContentTracking));
            this.jobTracking = new Map(content) as JobTrackingInfo<T>;
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
        for (const [, { value, clientId }] of this.jobTracking) {
            if (clientId === this.runtime.clientId) {
                this.emit("localRelease", value, false /* intentional */);
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
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

                default: unreachableCase(op);
            }
            if (local) {
                assert(
                    localOpMetadata, `localOpMetadata is missing from the local client's ${op.opName} operation`);
                // Resolve the pending promise for this operation now that we have received an ack for it.
                const resolve = localOpMetadata as PendingResolve<T>;
                resolve(value);
            }
        }
    }

    private async submit<TMessage extends IConsensusOrderedCollectionOperation>(
        message: TMessage,
    ): Promise<IConsensusOrderedCollectionValue<T> | undefined> {
        assert(this.isAttached());

        return this.newAckBasedPromise<IConsensusOrderedCollectionValue<T>>((resolve) => {
            // Send the resolve function as the localOpMetadata. This will be provided back to us when the
            // op is ack'd.
            this.submitLocalMessage(message, resolve);
            // If we fail due to runtime being disposed, it's better to return undefined then unhandled exception.
        }).catch((error) => undefined);
    }

    private addCore(value: T) {
        this.data.add(value);
        this.emit("add", value, true /* newlyAdded */);
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
        this.jobTracking.set(value2.acquireId, { value, clientId });

        this.emit("acquire", value, clientId);
        return value2;
    }

    private async acquireInternal(): Promise<IConsensusOrderedCollectionValue<T> | undefined> {
        if (!this.isAttached()) {
            // can be undefined if queue is empty
            return this.acquireCore(uuid(), idForLocalUnattachedClient);
        }

        return this.submit<IConsensusOrderedCollectionAcquireOperation>({
            opName: "acquire",
            acquireId: uuid(),
        });
    }

    private removeClient(clientIdToRemove?: string) {
        const added: T[] = [];
        for (const [acquireId, { value, clientId }] of this.jobTracking) {
            if (clientId === clientIdToRemove) {
                this.jobTracking.delete(acquireId);
                this.data.add(value);
                added.push(value);
            }
        }

        // Raise all events only after all state changes are completed,
        // to guarantee same ordering of operations if collection is manipulated from events.
        added.map((value) => this.emit("add", value, false /* newlyAdded */));
    }

    private serializeValue(value) {
        return this.runtime.IFluidSerializer.stringify(
            value,
            this.runtime.IFluidHandleContext,
            this.handle);
    }

    private deserializeValue(content: string) {
        return this.runtime.IFluidSerializer.parse(
            content,
            this.runtime.IFluidHandleContext);
    }
}
