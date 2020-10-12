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
import { SharedLogFactory } from "./factory";
import { debug } from "./debug";
import { IInteriorNode, blockSize, ILeafNode, LogNode } from "./types";

/**
 * Implementation of a cell shared object
 */
export class SharedLog<T extends Serializable = Serializable>
    extends SharedObject
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

    /**
     * Virtualized B+Tree containing ACKed entries.  The tree height is fixed and the rightmost edge
     * is always loaded.  The children of other interior nodes and leaves may be evicted.
     */
    public readonly root: IInteriorNode<T> = {
        p: 1,
        c: [{
            p: 1,
            c: [{
                p: 1,
                c: [{
                    h: undefined,
                    c: this.rightmostLeaf,
                }],
            }],
        }],
    };

    public constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    public get ackedLength(): number {
        // Calculates the number of entries in the B-Tree by computing the number
        // of fully populated leaves and then adding the number of entries in the
        // partially populated rightmostLeaf.
        let length = 0;
        for (let i = 0, children: unknown[] = this.root.c; i < 3; i++) {
            const lastChild = children.length - 1;
            /* eslint-disable no-bitwise */
            length |= lastChild;
            length <<= 8;
            /* eslint-enable no-bitwise */

            children = (children[lastChild] as IInteriorNode).c;
        }

        return length + this.rightmostLeaf.length;
    }

    public get length(): number {
        return this.ackedLength + this.pending.length;
    }

    private loadLeafChildren(leaf: ILeafNode<T>): T[] {
        if (leaf.c !== undefined) {
            return leaf.c;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw (leaf.h! as IFluidHandle<ArrayBufferLike>)
            .get()
            .then((blob) => {
                leaf.c = JSON.parse(new TextDecoder().decode(blob));
            });
    }

    public getEntry(index: number): T {
        /* eslint-disable no-bitwise */

        const ackedLength = this.ackedLength;

        if (index < ackedLength) {
            const c1 = this.root.c[index >>> 24] as IInteriorNode<T>;
            const c2 = c1.c[(index << 8) >>> 24] as IInteriorNode<T>;
            const leaf = c2.c[(index << 16) >>> 24] as ILeafNode<T>;

            const children = this.loadLeafChildren(leaf);
            return children[(index << 24) >>> 24];
        } else {
            return this.pending[index - ackedLength];
        }

        /* eslint-enable no-bitwise */
    }

    public appendEntry(entry: T) {
        this.pending.push(entry);

        if (this.isAttached()) {
            this.submitLocalMessage({ e: entry });
        }
    }

    private insert(
        node: IInteriorNode<T>,
        height: number,
        leaf: ILeafNode<T>,
    ): LogNode<T> | undefined {
        const children = node.c;
        let child: LogNode<T> | undefined;

        // eslint-disable-next-line no-param-reassign
        if (--height > 0) {
            child = this.insert(children[children.length - 1] as IInteriorNode<T>, height, leaf);
            if (child === undefined) {
                return undefined;
            }
        } else {
            child = leaf;
        }

        if (children.length === blockSize) {
            return { p: 1, c: [child] };
        }

        node.p++;
        children.push(child);

        return undefined;
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

    private async uploadLeaf(node: ILeafNode<T>) {
        assert.equal(node.c?.length, blockSize);
        assert.equal(node.h, undefined);

        node.h = this.runtime.uploadBlob(
            new TextEncoder()
                .encode(JSON.stringify(node.c)));

        // When the promise resolves, replace 'node.h' with the resolved handle.
        node.h = await node.h;
    }

    private findRightMost(node: LogNode<T> = this.root, height = 3): ILeafNode<T> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const children = node.c!;

        // eslint-disable-next-line no-param-reassign
        if (--height >= 0) {
            return this.findRightMost(children[children.length - 1] as LogNode<T>, height);
        } else {
            return node as ILeafNode<T>;
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
            this.rightmostLeaf.push(message.contents.e);
            if (this.rightmostLeaf.length === blockSize) {
                if (local) {
                    // eslint-disable-next-line @typescript-eslint/unbound-method
                    this.uploadLeaf(this.findRightMost()).catch(console.error);
                }

                this.rightmostLeaf = [];
                this.insert(this.root, /* height: */ 3, {
                    h: undefined,
                    c: this.rightmostLeaf,
                });
            }

            if (local) {
                this.pending.shift();
            }
        }
    }
}
