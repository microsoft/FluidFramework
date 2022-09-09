/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { ModelMakerCallback } from "./interfaces";
import { makeModelRequestHandler } from "./modelLoader";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ModelContainerRuntimeFactory<ModelType> extends BaseContainerRuntimeFactory {
    constructor(
        registryEntries: NamedFluidDataStoreRegistryEntries,
        modelMakerCallback: ModelMakerCallback<ModelType>,
        runtimeOptions?: IContainerRuntimeOptions,
    ) {
        super(
            registryEntries,
            undefined, // dependencyContainer
            [makeModelRequestHandler(modelMakerCallback)],
            runtimeOptions,
        );
    }
}
