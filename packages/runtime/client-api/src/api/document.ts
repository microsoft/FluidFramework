/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as cell from "@fluidframework/cell";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import {
    IDeltaManager, ILoaderOptions,
} from "@fluidframework/container-definitions";
import * as ink from "@fluidframework/ink";
import { ISharedDirectory, ISharedMap, SharedDirectory, SharedMap } from "@fluidframework/map";
import {
    IDocumentMessage,
    ISequencedClient,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * A document is a collection of shared types.
 */
export class Document extends EventEmitter {
    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.runtime.deltaManager;
    }

    public get options(): ILoaderOptions {
        return this.runtime.options;
    }

    /**
     * Flag indicating whether this document is fully connected.
     */
    public get isConnected(): boolean {
        return this.runtime.connected;
    }

    /**
     * Constructs a new document from the provided details
     */
    constructor(
        public readonly runtime: FluidDataStoreRuntime,
        public readonly context: IFluidDataStoreContext,
        private readonly root: ISharedMap,
        private readonly closeFn: () => void,
    ) {
        super();
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.runtime.on(event, listener);
        return this;
    }

    /**
     * Loads the specified shared object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another shared object.
     *
     * @param id - Identifier of the object to load
     */
    public async get(id: string): Promise<ISharedObject> {
        const channel = await this.runtime.getChannel(id);
        return channel as ISharedObject;
    }

    /**
     * Creates a new shared map
     */
    public createMap(): ISharedMap {
        return SharedMap.create(this.runtime);
    }

    /**
     * Creates a new shared directory
     */
    public createDirectory(): ISharedDirectory {
        return SharedDirectory.create(this.runtime);
    }

    /**
     * Creates a new shared cell.
     */
    public createCell(): cell.ISharedCell {
        return cell.SharedCell.create(this.runtime);
    }

    /**
     * Creates a new shared string
     */
    public createString(): sequence.SharedString {
        return sequence.SharedString.create(this.runtime);
    }

    /**
     * Creates a new ink shared object
     */
    public createInk(): ink.IInk {
        return ink.Ink.create(this.runtime);
    }

    /**
     * Retrieves the root shared object that the document is based on
     */
    public getRoot(): ISharedMap {
        return this.root;
    }

    public getClients(): Map<string, ISequencedClient> {
        const quorum = this.runtime.getQuorum();
        return quorum.getMembers();
    }

    public getClient(clientId: string): ISequencedClient {
        const quorum = this.runtime.getQuorum();
        return quorum.getMember(clientId);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        return this.closeFn();
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return this.runtime.uploadBlob(blob);
    }
}
