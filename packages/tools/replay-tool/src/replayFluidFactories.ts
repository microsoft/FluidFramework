/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell } from "@fluidframework/cell";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { Ink } from "@fluidframework/ink";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import {
    buildRuntimeRequestHandler,
    RuntimeRequestHandler,
} from "@fluidframework/request-handler";
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { create404Response, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import {
    SharedIntervalCollection,
    SharedNumberSequence,
    SharedObjectSequence,
    SharedString,
    SparseMatrix,
} from "@fluidframework/sequence";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { UnknownChannelFactory } from "./unknownChannel";

async function runtimeRequestHandler(request: IRequest, runtime: IContainerRuntime) {
    if (request.url === "/containerRuntime") {
        return { mimeType: "fluid/object", status: 200, value: runtime };
    } else {
        return create404Response(request);
    }
}

/** Simple runtime factory that creates a container runtime */
export class ReplayRuntimeFactory extends RuntimeFactoryHelper {
    constructor(
        private readonly runtimeOptions: IContainerRuntimeOptions,
        private readonly registries: NamedFluidDataStoreRegistryEntries,
        private readonly requestHandlers: RuntimeRequestHandler[] = []) {
        super();
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        return ContainerRuntime.load(
            context,
            this.registries,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                runtimeRequestHandler,
            ),
            this.runtimeOptions,
            undefined, // containerScope
            existing,
        );
    }
}
// these dds don't have deterministic content, or the
// factories are unavailable to us. they will be excluded
// from comparison
export const excludeChannelContentDdsFactories: IChannelFactory[] = [
    SharedMatrix.getFactory(),
    SharedSummaryBlock.getFactory(),
    new UnknownChannelFactory("https://graph.microsoft.com/types/SharedArray"),
    new UnknownChannelFactory("https://graph.microsoft.com/types/signal"),
];
const allDdsFactories: IChannelFactory[] = [
    ... excludeChannelContentDdsFactories,
    SharedMap.getFactory(),
    SharedString.getFactory(),
    Ink.getFactory(),
    SharedCell.getFactory(),
    SharedObjectSequence.getFactory(),
    SharedNumberSequence.getFactory(),
    ConsensusQueue.getFactory(),
    ConsensusRegisterCollection.getFactory(),
    SparseMatrix.getFactory(),
    SharedDirectory.getFactory(),
    SharedIntervalCollection.getFactory(),
];

/**
 * Simple data store factory that creates a data store runtime with a list of known DDSs. It does not create a data
 * object since the replay tool doesn't request any data store but only loads the data store runtime to summarize it.
 */
export class ReplayDataStoreFactory implements IFluidDataStoreFactory, Partial<IFluidDataStoreRegistry> {
    public readonly type = "@fluid-internal/replay-tool";

    public get IFluidDataStoreFactory() { return this; }

    public get IFluidDataStoreRegistry() {
        return this;
    }

    /**
     * Return ourselves when asked for child data store entry. The idea is that each data store that is created
     * has access to and can create from the list of known DDSs.
    */
    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        return this;
    }

    public constructor(
        private readonly runtimeClassArg: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
    ) {}

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        return new this.runtimeClassArg(
            context,
            new Map(allDdsFactories.map((factory) => [factory.type, factory])),
            true /* existing */,
        );
    }
}
