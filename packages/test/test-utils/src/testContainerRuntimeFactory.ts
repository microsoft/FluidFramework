/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { deprecated_innerRequestHandler, RuntimeRequestHandlerBuilder } from "@fluidframework/request-handler";
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
            deprecated_innerRequestHandler);

        const runtime = await ContainerRuntime._load(
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
        }

        return runtime;
    }
}
