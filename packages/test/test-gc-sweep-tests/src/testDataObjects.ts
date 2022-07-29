/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
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
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import Random from "random-js";
import {
    ConsensusQueueHandler,
    ConsensusRegisterCollectionHandler,
    HandleOpHandler,
    InkHandler,
    IRandomOpHandler,
    OpHandler,
    SharedCellHandler,
    SharedCounterHandler,
    SharedMapHandler,
} from "./channelHandler";

// data store that exposes container runtime for testing.
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

export class DataObjectManyDDSes extends BaseTestDataObject {
    public static get type(): string {
        return "TestDataObjectWithEveryDDS";
    }

    private readonly opHandlers: OpHandler[] = [];
    private readonly handleOpHandlers: HandleOpHandler[] = [];
    private readonly randomOpHandlers: IRandomOpHandler[] = [];
    private random: Random | undefined;

    public setRandom(random: Random) {
        this.random = random;
        for (const opHandler of this.opHandlers) {
            opHandler.random = random;
        }
    }

    public async generateAddHandleOp(handle: IFluidHandle): Promise<IFluidHandle | undefined> {
        assert(this.random !== undefined, `Random for TestDataObjectWithEveryDDS needs to be set!`);
        const handler: HandleOpHandler = this.random.pick(this.handleOpHandlers);
        return handler.executeRandomAddHandleOp(handle);
    }

    public async generateRemoveHandleOp(): Promise<IFluidHandle | undefined> {
        assert(this.random !== undefined, `Random for TestDataObjectWithEveryDDS needs to be set!`);
        const handler: HandleOpHandler = this.random.pick(this.handleOpHandlers);
        return handler.executeRandomRemoveHandleOp();
    }

    protected async hasInitialized(): Promise<void> {
        const consensusQueue: ConsensusQueue<IFluidHandle> = ConsensusQueue.create(this.runtime);
        const consensusQueueHandler = new ConsensusQueueHandler(consensusQueue);
        this.opHandlers.push(consensusQueueHandler);
        this.handleOpHandlers.push(consensusQueueHandler);

        const consensusRegisterCollection: ConsensusRegisterCollection<IFluidHandle> =
            ConsensusRegisterCollection.create(this.runtime);
        const consensusRegisterCollectionHandler = new ConsensusRegisterCollectionHandler(consensusRegisterCollection);
        this.opHandlers.push(consensusRegisterCollectionHandler);
        this.handleOpHandlers.push(consensusRegisterCollectionHandler);

        const ink: Ink = Ink.create(this.runtime);
        const inkHandler = new InkHandler(ink);
        this.opHandlers.push(inkHandler);
        this.randomOpHandlers.push(inkHandler);

        const sharedCell: SharedCell<IFluidHandle> = SharedCell.create(this.runtime);
        const sharedCellHandler = new SharedCellHandler(sharedCell);
        this.opHandlers.push(sharedCellHandler);
        this.handleOpHandlers.push(sharedCellHandler);
        this.randomOpHandlers.push(inkHandler);

        const sharedCounter: SharedCounter = SharedCounter.create(this.runtime);
        const sharedCounterHandler = new SharedCounterHandler(sharedCounter);
        this.opHandlers.push(sharedCounterHandler);
        this.randomOpHandlers.push(inkHandler);

        const sharedMap: SharedMap = SharedMap.create(this.runtime);
        const sharedMapHandler = new SharedMapHandler(sharedMap);
        this.opHandlers.push(sharedMapHandler);
        this.handleOpHandlers.push(sharedMapHandler);
        this.randomOpHandlers.push(inkHandler);
    }
}

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

export const baseTestDataObjectFactory = new DataObjectFactory(
    BaseTestDataObject.type,
    BaseTestDataObject,
    allFactories,
    {},
);

export const testDataObjectWithEveryDDSFactory = new DataObjectFactory(
    DataObjectManyDDSes.type,
    DataObjectManyDDSes,
    allFactories,
    {},
);
