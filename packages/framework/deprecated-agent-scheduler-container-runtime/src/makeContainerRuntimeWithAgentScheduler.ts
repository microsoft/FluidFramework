/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentSchedulerFactory } from "@fluidframework/agent-scheduler";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";

export const agentSchedulerId = "_scheduler";

/**
 * Produce a ContainerRuntime with AgentScheduler, compatible with ContainerRuntime.load() from versions prior to 0.38.
 * @deprecated This is provided as a migration tool only.  If you require back compat with documents produced prior to
 * 0.38, you'll need to add AgentScheduler to your ContainerRuntime registry.  If you want AgentScheduler
 * functionality, you should instantiate it in your container code as your scenario demands.
 */
 export const makeContainerRuntimeWithAgentScheduler = async (
    context: IContainerContext,
    registryEntries: NamedFluidDataStoreRegistryEntries,
    requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>,
    runtimeOptions?: IContainerRuntimeOptions,
    containerScope?: IFluidObject,
) => {
    const augmentedRegistry = [
        ...registryEntries,
        AgentSchedulerFactory.registryEntry,
    ];

    const runtime = await ContainerRuntime.load(
        context,
        augmentedRegistry,
        requestHandler,
        runtimeOptions,
        containerScope,
    );

    // Create all internal data stores if not already existing on storage or loaded a detached
    // container from snapshot(ex. draft mode).
    if (context.existing !== true) {
        await runtime.createRootDataStore(AgentSchedulerFactory.type, agentSchedulerId);
    }

    return runtime;
};
