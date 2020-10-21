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
import { IInteriorNode, ILeafNode, LogNode } from "./types";

/* eslint-disable no-bitwise */
const blockSize = 2 ** 10;
const leafSize = 2 ** 12;

const k0 = (index: number) => index >>> 22;
const k1 = (index: number) => (index << 10) >>> 22;
const k2 = (index: number) => (index << 20) >>> 20;
/* eslint-enable no-bitwise */

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
                h: undefined,
                c: this.rightmostLeaf,
            }],
        }],
    };

    public constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    public get ackedLength(): number {
        /* eslint-disable no-bitwise */
        /* eslint-disable @typescript-eslint/no-non-null-assertion */

        // Calculates the number of entries in the B-Tree by computing the number
        // of fully populated leaves and then adding the number of entries in the
        // partially populated rightmostLeaf.
        let length = 0;

        const c1 = this.root.c!;
        length |= c1.length - 1;
        length <<= 10;

        const c2 = (c1[c1.length - 1] as IInteriorNode<T>).c!;
        length |= c2.length - 1;
        length <<= 12;

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

    public getEntry(index: number): T {
        const ackedLength = this.ackedLength;

        if (index < ackedLength) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const c1 = this.root.c![k0(index)] as IInteriorNode<T>;
            const c2 = this.getChild(c1, /* index: */ k1(index)) as IInteriorNode<T>;
            return this.getChild(c2,     /* index: */ k2(index)) as T;
        } else {
            return this.pending[index - ackedLength];
        }
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const children = node.c!;
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        assert.equal(node.c!.length, leafSize);
        assert.equal(node.h, undefined);

        node.h = this.runtime.uploadBlob(
            new TextEncoder()
                .encode(JSON.stringify(node.c)));

        // When the promise resolves, replace 'node.h' with the resolved handle.
        node.h = await node.h;
    }

    private findRightMost(): ILeafNode<T> {
        /* eslint-disable @typescript-eslint/no-non-null-assertion */

        const c1 = this.root.c!;
        const c2 = (c1[c1.length - 1] as IInteriorNode<T>).c!;
        return c2[c2.length - 1] as ILeafNode<T>;

        /* eslint-enable @typescript-eslint/no-non-null-assertion */
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
            if (this.rightmostLeaf.length === leafSize) {
                if (local) {
                    this.uploadLeaf(this.findRightMost()).catch(console.error);
                }

                this.rightmostLeaf = [];
                this.insert(this.root, /* height: */ 2, {
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
