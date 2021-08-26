/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { innerRequestHandler, RuntimeRequestHandlerBuilder } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

/**
 * Create a container runtime factory class that allows you to set runtime options
 */
export const createTestContainerRuntimeFactory = (containerRuntimeCtor: typeof ContainerRuntime) => {
    return class extends RuntimeFactoryHelper {
        constructor(
            public type: string,
            public dataStoreFactory: IFluidDataStoreFactory,
            public runtimeOptions: IContainerRuntimeOptions = {
                summaryOptions: { initialSummarizerDelayMs: 0 },
            },
        ) {
            super();
        }

        public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
            await runtime.createRootDataStore(this.type, "default");

            // Test detached creation
            const root2Context = runtime.createDetachedRootDataStore([this.type], "default2");
            const root2Runtime = await this.dataStoreFactory.instantiateDataStore(root2Context, /* existing */ false);
            await root2Context.attachRuntime(this.dataStoreFactory, root2Runtime);
        }

        public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void> {
            // Validate we can load root data stores.
            // We should be able to load any data store that was created in initializeFirstTime!
            await runtime.getRootDataStore("default");
            await runtime.getRootDataStore("default2");
        }

        async preInitialize(
            context: IContainerContext,
            existing: boolean,
        ): Promise<IRuntime & IContainerRuntime> {
            const builder = new RuntimeRequestHandlerBuilder();
            builder.pushHandler(
                defaultRouteRequestHandler("default"),
                innerRequestHandler);

            const runtime: ContainerRuntime = await containerRuntimeCtor.load(
                context,
                [
                    ["default", Promise.resolve(this.dataStoreFactory)],
                    [this.type, Promise.resolve(this.dataStoreFactory)],
                ],
                async (req, rt) => builder.handleRequest(req, rt),
                this.runtimeOptions,
                undefined, // containerScope
                existing,
            );

            return runtime;
        }
    };
};

/**
 * A container runtime factory that allows you to set runtime options
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
