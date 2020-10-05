/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
        a: 0,
        i: undefined,
        c: [{
            a: 0,
            i: undefined,
            c: [{
                a: 0,
                i: undefined,
                c: [{
                    a: 0,
                    i: undefined,
                    c: this.rightmostLeaf,
                }],
            }],
        }],
    };

    private get ackedLength(): number {
        let length = 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (let i = 0, children: unknown[] = this.root.c!; i < 3; i++) {
            const lastChild = children.length - 1;
            /* eslint-disable no-bitwise */
            length |= lastChild;
            length <<= 8;
            /* eslint-enable no-bitwise */

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            children = (children[lastChild] as IInteriorNode).c!;
        }

        return length + this.rightmostLeaf.length;
    }

    public get length(): number {
        return this.ackedLength + this.pending.length;
    }

    private async loadChildren(parent: LogNode<T>) {
        const id = typeof parent.i === "object"
            ? await parent.i
            : parent.i as string;

        const blob = await this.runtime.getBlob(id);
        parent.c = JSON.parse(new TextDecoder().decode(blob?.content));

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return parent.c!;
    }

    private getChild(parent: LogNode<T>, index: number, callback: (child: T | LogNode<T>) => void) {
        if (parent.c === undefined) {
            this.loadChildren(parent)
                .then((children) => callback(children[index]))
                // eslint-disable-next-line @typescript-eslint/unbound-method
                .catch(console.error);
        } else {
            callback(parent.c[index]);
        }
    }

    public async getEntry(index: number): Promise<T> {
        /* eslint-disable no-bitwise */

        const ackedLength = this.ackedLength;

        if (index < ackedLength) {
            return new Promise((resolve) => {
                this.getChild(this.root, index >>> 24, (c1) => {
                    this.getChild(c1 as IInteriorNode<T>, (index << 8) >>> 24, (c2) => {
                        this.getChild(c2 as IInteriorNode<T>, (index << 16) >>> 24, (c3) => {
                            this.getChild(c3 as ILeafNode<T>, (index << 24) >>> 24, (c4) => {
                                resolve(c4 as T);
                            });
                        });
                    });
                });
            });
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
            return { a: 0, i: undefined, c: [child] };
        }

        children.push(child);
        return undefined;
    }

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    public constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    /**
     * Create a snapshot for the cell
     *
     * @returns the snapshot of the current state of the cell
     */
    public snapshot(): ITree {
        throw new Error("NYI");
    }

    /**
     * Load cell from snapshot
     *
     * @param branchId - Not used
     * @param storage - the storage to get the snapshot from
     * @returns - promise that resolved when the load is completed
     */
    protected async loadCore(
        branchId: string,
        storage: IChannelStorageService,
    ): Promise<void> {
        throw new Error("NYI");
    }

    /**
     * Initialize a local instance of cell
     */
    protected initializeLocalCore() { }

    /**
     * Process the cell value on register
     */
    protected registerCore() { }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() {
        debug(`'${this.id}' now disconnected.`);
    }

    private async uploadLeaf(node: ILeafNode<T>) {
        assert.equal(node.c?.length, blockSize);
        assert.equal(node.i, undefined);

        const content = new TextEncoder()
            .encode(JSON.stringify(node.c));

        node.i = this.runtime.uploadBlob({
            content,
            size: content.byteLength,
            fileName: "",
            id: "",
            type: "generic",
            url: "",
        }).then((blob) => blob.id);

        // When the promise resolves, replace 'node.i' with the resolved 'id' string.
        node.i = await node.i;
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
                    a: 0,
                    i: undefined,
                    c: this.rightmostLeaf,
                });
            }

            if (local) {
                this.pending.shift();
            }
        }
    }
}
