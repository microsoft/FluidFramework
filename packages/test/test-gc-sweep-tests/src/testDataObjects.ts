/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { Ink } from "@fluidframework/ink";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IChannel, IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import {
    ConsensusQueueHandler,
    ConsensusRegisterCollectionHandler,
    IAddedHandle,
    IHandleOpManager,
    InkHandler,
    IRandomOpManager,
    IRemovedHandle,
    SharedCellHandler,
    SharedCounterHandler,
    SharedMapHandler,
} from "./channelHandler";

// The BaseTestDataObject has functionality that all other data objects should derive
export class BaseTestDataObject extends DataObject {
    public static get type(): string {
        return "TestDataObject";
    }

    public get _root() {
        return this.root;
    }

    public get dataStoreRuntime(): IFluidDataStoreRuntime {
        return this.runtime;
    }

    public get containerRuntime(): ContainerRuntime {
        return this.context.containerRuntime as ContainerRuntime;
    }

    public get _context() {
        return this.context;
    }
}

// May want to rename all of these channels to DDSes
// The key for retrieving all the channel handles in DataObjectManyDDSes
const channelHandlesKey = "channelHandles";
// The key for retrieving all the channel ids in DataObjectManyDDSes
const channelIdsKey = "channelIds";

/**
 * The DataObject that should have all DDSes, currently missing as they are not yet implemented
 * - SharedDirectoryHandler
 * - SharedMatrixHandler
 * - SharedStringHandler
 */
export class DataObjectManyDDSes extends BaseTestDataObject {
    public static get type(): string {
        return "TestDataObjectWithEveryDDS";
    }

    private readonly handleManager: HandleManager = new HandleManager();
    private readonly randomOpHandlers: IRandomOpManager[] = [];

    // adds a handle to a random channel and returns the added data
    public async addHandleOpForChannel(
        ddsId: string,
        handle: IFluidHandle,
        random: IRandom,
    ): Promise<IAddedHandle> {
        return this.handleManager.executeAddHandleOp(ddsId, handle, random);
    }

    // removes a random handle from the specified DDS
    public async removeHandleForChannel(ddsId: string, random: IRandom): Promise<IRemovedHandle> {
        return this.handleManager.executeRandomRemoveHandleOp(ddsId, random);
    }

    // returns all the channelIds this DataObject has
    public getChannelIds(): string[] {
        const channelIds = this.root.get<string[]>(channelIdsKey);
        assert(channelIds !== undefined, `Channel handles should exist on the DDS!`);
        return channelIds;
    }

    // returns all the channelIds that can store handles
    public getHandleChannelIds(): string[] {
        return Array.from(this.handleManager.handleOpManagers.keys());
    }

    // Adds a channelType - will overwrite if one exists
    private addChannelType(channel: IChannel) {
        this.root.set(channel.constructor.name, channel.handle);
        this.root.set(channel.id, channel.handle);

        const handles: IFluidHandle[] = this.root.get(channelHandlesKey) ?? [];
        handles.push(channel.handle);
        this.root.set(channelHandlesKey, handles);

        const ids: string[] = this.root.get(channelIdsKey) ?? [];
        ids.push(channel.id);
        this.root.set(channelIdsKey, ids);
    }

    // Add all the different channels we support
    protected async initializingFirstTime(props?: any): Promise<void> {
        this.addChannelType(ConsensusQueue.create(this.runtime));
        this.addChannelType(ConsensusRegisterCollection.create(this.runtime));
        this.addChannelType(Ink.create(this.runtime));
        this.addChannelType(SharedCell.create(this.runtime));
        this.addChannelType(SharedCounter.create(this.runtime));
        this.addChannelType(SharedDirectory.create(this.runtime));
        this.addChannelType(SharedMap.create(this.runtime));
        this.addChannelType(SharedMatrix.create(this.runtime));
        this.addChannelType(SharedString.create(this.runtime));
    }

    // Gets the specified channel
    private async assertedGet<T>(key: string): Promise<T> {
        const handle = this.root.get<IFluidHandle<T>>(key);
        assert(handle !== undefined, `Expected ${key}!`);
        const channel = await handle.get();
        assert(channel !== undefined, `Expected channel to be defined for ${key}!`);
        return channel;
    }

    // Create IHandleManagers for DDSes that can add handles, and IRandomOpHandlers that can create non-handle ops
    protected async hasInitialized(): Promise<void> {
        const consensusQueueHandler = new ConsensusQueueHandler(
            await this.assertedGet<ConsensusQueue>("ConsensusQueue"),
        );
        this.handleManager.add(consensusQueueHandler);

        const consensusRegisterCollectionHandler = new ConsensusRegisterCollectionHandler(
            this.root,
            await this.assertedGet<ConsensusRegisterCollection<IFluidHandle | null>>("ConsensusRegisterCollection"),
        );
        this.handleManager.add(consensusRegisterCollectionHandler);

        const inkHandler = new InkHandler(await this.assertedGet<Ink>("Ink"));
        this.randomOpHandlers.push(inkHandler);

        const sharedCellHandler = new SharedCellHandler(await this.assertedGet<SharedCell>("SharedCell"));
        this.handleManager.add(sharedCellHandler);

        const sharedCounterHandler = new SharedCounterHandler(await this.assertedGet<SharedCounter>("SharedCounter"));
        this.randomOpHandlers.push(sharedCounterHandler);

        const sharedMapHandler = new SharedMapHandler(await this.assertedGet<SharedMap>("SharedMap"));
        this.handleManager.add(sharedMapHandler);
        this.randomOpHandlers.push(sharedMapHandler);
    }
}

/**
 * HandleManager is responsible for adding handles and removing handles for a particular set of DDSes
 */
export class HandleManager {
    public readonly handleOpManagers: Map<string, IHandleOpManager> = new Map();

    public add(handleOpManager: IHandleOpManager) {
        this.handleOpManagers.set(handleOpManager.channel.id, handleOpManager);
    }

    public async executeAddHandleOp(
        ddsId: string,
        handle: IFluidHandle,
        random: IRandom,
    ): Promise<IAddedHandle> {
        const handleOpManager = this.handleOpManagers.get(ddsId);
        assert(handleOpManager !== undefined,
            // eslint-disable-next-line max-len
            `Missing handle op manager for ${ddsId}, size: ${this.handleOpManagers.size} keys: ${this.handleOpManagers.keys()}`);
        return handleOpManager.addHandle(handle, random);
    }

    public async executeRandomRemoveHandleOp(
        ddsId: string,
        random: IRandom,
    ): Promise<IRemovedHandle> {
        const handleOpManager = this.handleOpManagers.get(ddsId);
        assert(handleOpManager !== undefined,
            `Missing handle op manager for ${ddsId} keys: ${this.handleOpManagers.keys()}`);
        assert(handleOpManager.hasHandles(), `No handles in op manager for ${handleOpManager.type} ${ddsId}`);
        return handleOpManager.removeRandomHandle(random);
    }
}

// Factories for all the channels we support
const allFactories: IChannelFactory[] = [
    ConsensusQueue.getFactory(),
    ConsensusRegisterCollection.getFactory(),
    Ink.getFactory(),
    SharedCell.getFactory(),
    SharedCounter.getFactory(),
    SharedDirectory.getFactory(),
    SharedMap.getFactory(),
    SharedMatrix.getFactory(),
    SharedString.getFactory(),
];

// The DataObjectFactory for DataObjectManyDDSes
export const dataObjectWithManyDDSesFactory = new DataObjectFactory(
    DataObjectManyDDSes.type,
    DataObjectManyDDSes,
    allFactories,
    {},
);
