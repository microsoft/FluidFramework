/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { innerRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";

/**
 * We'll allow root data stores to be created by requesting a url like /create/dropletType/dataStoreId
 */
const createRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts[0] === "create" && request.pathParts.length === 3) {
            await runtime.createRootDataStore(request.pathParts[1], request.pathParts[2]);
            return runtime.request(request.createSubRequest(2));
        }
    };

/**
 * The DOProviderContainerRuntimeFactory is the container code for our scenario.
 *
 * By including the createRequestHandler, we can create any droplet types we include in the registry on-demand.
 * These can then be retrieved via container.request("/dataObjectId").
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor(registryEntries: NamedFluidDataStoreRegistryEntry[]) {
        super(registryEntries, [], [createRequestHandler, innerRequestHandler]);
    }
}
