/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import {
    rootDataStoreRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { SharedTextDataStoreFactory } from "./component";

const DefaultComponentName = "text";

class SharedTextContainerRuntimeFactory extends RuntimeFactoryHelper {
    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(SharedTextDataStoreFactory.type, DefaultComponentName);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            [
                [SharedTextDataStoreFactory.type, Promise.resolve(SharedTextDataStoreFactory)],
            ],
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(DefaultComponentName),
                rootDataStoreRequestHandler,
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );

        return runtime;
    }
}

export const fluidExport = new SharedTextContainerRuntimeFactory();
