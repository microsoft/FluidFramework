/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IStatelessContainerContext,
} from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
    innerRequestHandler,
    RuntimeRequestHandlerBuilder,
    rootDataStoreRequestHandler,
} from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

/**
 * Create a container runtime factory class that allows you to set runtime options
 */
export const createTestContainerRuntimeFactory = (containerRuntimeCtor: typeof ContainerRuntime) => {
    return class implements IRuntimeFactory {
        public get IRuntimeFactory() { return this; }

        constructor(
            public type: string,
            public dataStoreFactory: IFluidDataStoreFactory,
            public runtimeOptions: IContainerRuntimeOptions = {
                summaryOptions: { initialSummarizerDelayMs: 0 },
            },
        ) { }

        public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
            const builder = new RuntimeRequestHandlerBuilder();
            builder.pushHandler(
                defaultRouteRequestHandler("default"),
                innerRequestHandler);

            const runtime = await containerRuntimeCtor.load(
                context,
                [
                    ["default", Promise.resolve(this.dataStoreFactory)],
                    [this.type, Promise.resolve(this.dataStoreFactory)],
                ],
                async (req, rt) => builder.handleRequest(req, rt),
                this.runtimeOptions,
            );

            if (!runtime.existing) {
                await runtime.createRootDataStore(this.type, "default");

                // Test detached creation
                const root2Context = runtime.createDetachedRootDataStore([this.type], "default2");
                const root2Runtime = await this.dataStoreFactory.instantiateDataStore(root2Context);
                await root2Context.attachRuntime(this.dataStoreFactory, root2Runtime);
            } else {
                // Validate we can load root data stores.
                // We should be able to load any data store that was created in instantiateRuntime!
                await runtime.getRootDataStore("default");
                await runtime.getRootDataStore("default2");
            }

            return runtime;
        }

        public async instantiateFirstTime(context: IStatelessContainerContext): Promise<IRuntime> {
            const runtime = await this.loadRuntime(context);
            await runtime.createRootDataStore(this.type, "default");

            // Test detached creation
            const root2Context = runtime.createDetachedRootDataStore([this.type], "default2");
            const root2Runtime = await this.dataStoreFactory.instantiateDataStore(root2Context);
            await root2Context.attachRuntime(this.dataStoreFactory, root2Runtime);
            return runtime;
        }

        public async instantiateFromExisting(context: IStatelessContainerContext): Promise<IRuntime> {
            const runtime = await this.loadRuntime(context);

            // Validate we can load root data stores.
            // We should be able to load any data store that was created in initializeFirstTime!
            await runtime.getRootDataStore("default");
            await runtime.getRootDataStore("default2");
            return runtime;
        }

        async loadRuntime(context: any) {
            const builder = new RuntimeRequestHandlerBuilder();
            builder.pushHandler(
                defaultRouteRequestHandler("default"),
                rootDataStoreRequestHandler);

            const runtime = await containerRuntimeCtor.load(
                context,
                [
                    ["default", Promise.resolve(this.dataStoreFactory)],
                    [this.type, Promise.resolve(this.dataStoreFactory)],
                ],
                async (req, rt) => builder.handleRequest(req, rt),
                this.runtimeOptions,
            );

            return runtime;
        }
    };
};

/**
 * A container runtime factory that allows you to set runtime options
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
