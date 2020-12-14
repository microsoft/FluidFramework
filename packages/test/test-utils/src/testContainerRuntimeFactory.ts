/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { innerRequestHandler, RuntimeRequestHandlerBuilder } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

/**
 * A container runtime factory that allows you to set runtime options
 */
export class TestContainerRuntimeFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    constructor(
        public type: string,
        public dataStoreFactory: IFluidDataStoreFactory,
        public runtimeOptions: IContainerRuntimeOptions,
    ) { }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const builder = new RuntimeRequestHandlerBuilder();
        builder.pushHandler(
            defaultRouteRequestHandler("default"),
            innerRequestHandler);

        const runtime = await ContainerRuntime.load(
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

            // back-compat: remove this check in 0.30
            if ("createDetachedRootDataStore" in runtime) {
                // Test detached creation
                const root2Context = runtime.createDetachedRootDataStore([this.type], "default2");
                const root2Runtime = await this.dataStoreFactory.instantiateDataStore(root2Context);
                await root2Context.attachRuntime(this.dataStoreFactory, root2Runtime);
            }
        } else {
            // Validate we can load root data stores.
            // We should be able to load any data store that was created in instantiateRuntime!
            await runtime.getRootDataStore("default");
            await runtime.getRootDataStore("default2");
        }

        return runtime;
    }
}
