/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    buildRuntimeRequestHandler,
    RuntimeRequestHandler,
    deprecated_innerRequestHandler,
} from "@fluidframework/request-handler";
import {
    FluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
    FlushMode,
} from "@fluidframework/runtime-definitions";

const defaultComponentId = "" as const;

export class RuntimeFactory implements IRuntimeFactory {
    private readonly registry: FluidDataStoreRegistryEntries;

    constructor(
        private readonly defaultComponent: IFluidDataStoreFactory,
        components: IFluidDataStoreFactory[] = [defaultComponent],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry =
            (components.includes(defaultComponent)
                ? components
                : components.concat(defaultComponent)
            ) as FluidDataStoreRegistryEntries;
    }

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registry,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                deprecated_innerRequestHandler),
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing && this.defaultComponent.type) {
            await runtime.createRootDataStore(this.defaultComponent.type, defaultComponentId);
        }

        return runtime;
    }
}
