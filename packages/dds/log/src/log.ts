/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
    Serializable,
} from "@fluidframework/datastore-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
import { IVectorConsumer, IVectorProducer, IVectorReader } from "@tiny-calc/nano";
import { SharedLogFactory } from "./factory";
import { debug } from "./debug";
import {
    log2BlockSize,
    log2LeafSize,
    blockSize,
    leafSize,
    InteriorNode,
    LeafNode,
    LogNode,
} from "./types";

/* eslint-disable no-bitwise */
const k0 = (index: number) => index >>> (32 - log2BlockSize);
const k1 = (index: number) => (index << log2BlockSize) >>> (32 - log2BlockSize);
const k2 = (index: number) => (index << (32 - log2LeafSize)) >>> (32 - log2LeafSize);
/* eslint-enable no-bitwise */

/**
 * Implementation of a cell shared object
 */
export class SharedLog<T extends Serializable = Serializable>
    extends SharedObject
    implements IVectorProducer<T>, IVectorReader<T>
{
    /**
     * Create a new shared cell
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create<T extends Serializable = Serializable>(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedLogFactory.Type) as SharedLog<T>;
    }

    /**
     * Get a factory for SharedLog to register with the data store.
     *
     * @returns a factory that creates and load SharedLog
     */
    public static getFactory(): IChannelFactory {
        return new SharedLogFactory();
    }

    /** Local log entries that have not yet been ACKed (always later than any items in B+Tree.) */
    public readonly pending: T[] = [];

    /** Reference to the children of the current rightmost leaf for quickly adding ACKed entries. */
    private rightmostLeaf: T[] = [];

    private readonly consumers = new Set<IVectorConsumer<T>>();

    /**
     * Virtualized B+Tree containing ACKed entries.  The tree height is fixed and the rightmost edge
     * is always loaded.  The children of other interior nodes and leaves may be evicted.
     */
    public readonly root: InteriorNode<T> = {
        r: 1,
        c: [{
            r: 1,
            c: [{
                r: 1,
                h: undefined,
                c: this.rightmostLeaf,
            }],
        }],
    };

    public constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    // #region IVectorProducer

    public openVector(consumer: IVectorConsumer<T>): IVectorReader<T> {
        this.consumers.add(consumer);
        return this;
    }

    public closeVector(consumer: IVectorConsumer<T>): void {
        this.consumers.delete(consumer);
    }

    // #endregion IVectorProducer

    // #region IVectorReader

    public getItem(index: number): T {
        const ackedLength = this.ackedLength;

        if (index < ackedLength) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const c1 = this.root.c![k0(index)] as InteriorNode<T>;
            const c2 = this.getChild(c1, /* index: */ k1(index)) as InteriorNode<T>;
            return this.getChild(c2,     /* index: */ k2(index)) as T;
        } else {
            return this.pending[index - ackedLength];
        }
    }

    public async awaitItem(index: number): Promise<T> {
        for (;;) {
            try {
                return this.getItem(index);
            } catch (error) {
                if (typeof error.then === "function") {
                    await error;
                }
            }
        }
    }

    public get vectorProducer(): IVectorProducer<T> { return this; }

    // #endregion IVectorReader

    public get ackedLength(): number {
        /* eslint-disable no-bitwise */
        /* eslint-disable @typescript-eslint/no-non-null-assertion */

        // Calculates the number of entries in the B-Tree by computing the number
        // of fully populated leaves and then adding the number of entries in the
        // partially populated rightmostLeaf.
        let length = 0;

        const c1 = this.root.c!;
        length |= c1.length - 1;
        length <<= log2BlockSize;

        const c2 = (c1[c1.length - 1] as InteriorNode<T>).c!;
        length |= c2.length - 1;
        length <<= log2LeafSize;

        /* eslint-enable @typescript-eslint/no-non-null-assertion */
        /* eslint-enable no-bitwise */

        return length + this.rightmostLeaf.length;
    }

    public get length(): number {
        return this.ackedLength + this.pending.length;
    }

    private getChild(parent: LogNode<T>, index: number): LogNode<T> | T {
        return this.getChildren(parent)[index];
    }

    private getChildren(node: LogNode<T>): LogNode<T>[] | T[] {
        if (node.c !== undefined) {
            return node.c;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw (node.h! as IFluidHandle<ArrayBufferLike>)
            .get()
            .then((blob) => {
                node.c = JSON.parse(new TextDecoder().decode(blob));
            });
    }

    public push(...items: T[]) {
        this.pending.push(...items);

        if (this.isAttached()) {
            this.submitLocalMessage(items);
        }

        this.noteInsert(this.length - items.length, items.length);
    }

    private pushAcked(shouldUploadFullNodes: boolean, ...items: T[]) {
        while (items.length > 0) {
            const available = leafSize - this.rightmostLeaf.length;
            if (available > items.length) {
                this.rightmostLeaf.push(...items);
                return;
            } else if (available > 0) {
                this.rightmostLeaf.push(...items.splice(0, /* deleteCount: */ available));

                /* eslint-disable @typescript-eslint/no-non-null-assertion */

                const root = this.root;
                const mid = (root.c![root.c!.length - 1] as InteriorNode<T>);
                let leaf = mid.c![mid.c!.length - 1] as LeafNode<T>;
                leaf.r--;

                if (shouldUploadFullNodes) {
                    this.upload(leaf).catch(console.error);
                }

                leaf = { r: 1, c: this.rightmostLeaf = [] };

                if (mid.c!.length === blockSize) {
                    mid.r--;

                    if (shouldUploadFullNodes) {
                        this.upload(mid)
                            .catch(console.error);
                    }

                    root.c!.push({ r: 1, c: [ leaf ] });
                } else {
                    mid.c!.push(leaf);
                }

                /* eslint-enable @typescript-eslint/no-non-null-assertion */
            }
        }
    }

    public snapshot(): ITree {
        throw new Error("NYI");
    }

    protected async loadCore(
        branchId: string,
        storage: IChannelStorageService,
    ): Promise<void> {
        throw new Error("NYI");
    }

    protected initializeLocalCore() { }

    protected registerCore() { }

    protected onDisconnect() {
        debug(`'${this.id}' now disconnected.`);
    }

    private async upload(node: LogNode<T>) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        assert(node.c!.length === leafSize || node.c!.length === blockSize);
        assert.equal(node.h, undefined);

        node.h = this.runtime.uploadBlob(
            new TextEncoder()
                .encode(JSON.stringify(node.c)));

        // When the promise resolves, replace 'node.h' with the resolved handle.
        node.h = await node.h;

        // If the node's ref count is zero after upload, evict it now.
        if (node.r === 0) {
            debug(`node evicted`);
            node.c = undefined;
        }
    }

    /**
     * Process a cell operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            const items: T[] = message.contents;
            this.pushAcked(/* shouldUploadFullNodes: */ local, ...items);

            if (local) {
                this.pending.splice(0, /* deleteCount */ items.length);
            } else {
                this.noteInsert(this.ackedLength - items.length, /* insertedCount: */ items.length);
            }
        }
    }

    private noteInsert(start: number, insertedCount: number) {
        for (const consumer of this.consumers) {
            consumer.itemsChanged(start, /* removedCount: */ 0, insertedCount, /* producer: */ this);
        }
    }
}
