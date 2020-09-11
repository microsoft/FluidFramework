/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { ISharedLogEvents } from "./types";
import { LogIndex } from "./cache";

/**
 * Implementation of a cell shared object
 */
export class SharedLog<T extends Serializable = any>
    extends SharedObject<ISharedLogEvents<T>>
{
    /**
     * Create a new shared cell
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedLogFactory.Type) as SharedLog;
    }

    /**
     * Get a factory for SharedLog to register with the data store.
     *
     * @returns a factory that creates and load SharedLog
     */
    public static getFactory(): IChannelFactory {
        return new SharedLogFactory();
    }

    private readonly pending: T[] = [];
    private readonly cache: LogIndex<T> = new LogIndex<T>();

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

    public append(entry: T) {
        this.pending.push(entry);

        if (this.isAttached()) {
            this.submitLocalMessage({ e: entry });
        }
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
            this.cache.append(message.contents.e);
            if (local) {
                this.pending.shift();
            }
        }
    }
}
