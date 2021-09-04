/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    ISequencedClient,
} from "@fluidframework/protocol-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";

/**
 * A document is a collection of shared types.
 */
export class Document {
    public get clientId(): string {
        return this.runtime.clientId;
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
        public readonly runtime: IFluidDataStoreRuntime,
        public readonly context: IFluidDataStoreContext,
    ) { }

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
     * Creates a new shared string
     */
    public createString(): sequence.SharedString {
        return sequence.SharedString.create(this.runtime);
    }

    public getClient(clientId: string): ISequencedClient {
        const quorum = this.runtime.getQuorum();
        return quorum.getMember(clientId);
    }
}
