/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    IContainerRuntimeOptions,
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import {
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { ModelMakerCallback } from "./interfaces";
import { makeModelRequestHandler } from "./modelLoader";

/**
 * BaseContainerRuntimeFactory produces container runtimes with a given data store and service registry, as well as
 * given request handlers.  It can be subclassed to implement a first-time initialization procedure for the containers
 * it creates.
 */
export class ModelContainerRuntimeFactory<ModelType> implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    /**
     * @param registryEntries - The data store registry for containers produced
     * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
     */
    constructor(
        private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
        private readonly modelMakerCallback: ModelMakerCallback<ModelType>,
        private readonly runtimeOptions?: IContainerRuntimeOptions,
    ) { }

    public async instantiateRuntime(
        context: IContainerContext,
        existing?: boolean,
    ): Promise<IRuntime> {
        const fromExisting = existing ?? context.existing ?? false;
        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            makeModelRequestHandler(this.modelMakerCallback),
            this.runtimeOptions,
            undefined, // scope
            existing,
        );

        if (!fromExisting) {
            await this.containerInitializingFirstTime(runtime);
        }
        await this.containerHasInitialized(runtime);

        return runtime;
    }

    /**
     * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
     * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) { }

    /**
     * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
     * This likely includes loading any data stores that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) { }
}
