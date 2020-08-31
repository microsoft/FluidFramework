/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    Jsonable,
    AsJsonable,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    SharedObject,
} from "@fluidframework/shared-object-base";
import { SharedSummaryBlockFactory } from "./sharedSummaryBlockFactory";
import { ISharedSummaryBlock } from "./interfaces";

const snapshotFileName = "header";

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 * Directly used in JSON.stringify, direct result from JSON.parse.
 */
interface ISharedSummaryBlockDataSerializable {
    [key: string]: Jsonable;
}

/**
 * Implementation of a shared summary block. It does not generate any ops. It is only part of the summary.
 * Data should be set in this object in response to a remote op.
 */
export class SharedSummaryBlock extends SharedObject implements ISharedSummaryBlock {
    /**
     * Create a new shared summary block
     *
     * @param runtime - data store runtime the new shared summary block belongs to.
     * @param id - optional name of the shared summary block.
     * @returns newly created shared summary block (but not attached yet).
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedSummaryBlockFactory.Type) as SharedSummaryBlock;
    }

    /**
     * Get a factory for SharedSummaryBlock to register with the data store.
     *
     * @returns a factory that creates and loads SharedSummaryBlock.
     */
    public static getFactory(): IChannelFactory {
        return new SharedSummaryBlockFactory();
    }

    /**
     * The data held by this object.
     */
    private readonly data = new Map<string, Jsonable>();

    /**
     * Constructs a new SharedSummaryBlock. If the object is non-local, an id and service interfaces will
     * be provided.
     *
     * @param id - optional name of the shared summary block.
     * @param runtime - data store runtime thee object belongs to.
     * @param attributes - The attributes for the object.
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    /**
     * {@inheritDoc ISharedSummaryBlock.get}
     */
    public get<T = Jsonable>(key: string): T {
        // The cast to unknown is needed because of a limitation in TypeScript where an interface cannot be cast to
        // Jsonable: https://github.com/Microsoft/TypeScript/issues/15300
        return this.data.get(key) as unknown as T;
    }

    /**
     * {@inheritDoc ISharedSummaryBlock.set}
     */
    public set<T extends any = Jsonable>(key: string, value: AsJsonable<T>): void {
        this.data.set(key, value);
        // Set this object as dirty so that it is part of the next summary.
        this.dirty();
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshot}
     */
    public snapshot(): ITree {
        const contentsBlob: ISharedSummaryBlockDataSerializable = {};
        this.data.forEach((value, key) => {
            contentsBlob[key] = value;
        });

        // Construct the tree for the data.
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry.Blob,
                    value: {
                        contents: JSON.stringify(contentsBlob),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IChannelStorageService): Promise<void> {
        const rawContent = await storage.read(snapshotFileName);
        const contents = JSON.parse(fromBase64ToUtf8(rawContent)) as ISharedSummaryBlockDataSerializable;

        for (const [key, value] of Object.entries(contents)) {
            this.data.set(key, value);
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
     */
    protected registerCore() { }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect() { }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        throw new Error("shared summary block should not generate any ops.");
    }
}
