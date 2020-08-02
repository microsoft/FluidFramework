/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    RuntimeRequestHandlerBuilder,
    RuntimeRequestHandler,
    defaultContainerRequestHandler,
} from "@fluidframework/request-handler";
import {
    NamedFluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
    FlushMode,
} from "@fluidframework/runtime-definitions";

const defaultComponentId = "" as const;

export class RuntimeFactory implements IRuntimeFactory {
    private readonly registry: NamedFluidDataStoreRegistryEntries;

    constructor(
        private readonly defaultComponent: IFluidDataStoreFactory,
        components: IFluidDataStoreFactory[] = [defaultComponent],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry =
            (components.includes(defaultComponent)
                ? components
                : components.concat(defaultComponent)
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (factory) => [factory.type!, factory]) as NamedFluidDataStoreRegistryEntries;
    }

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const builder = new RuntimeRequestHandlerBuilder();
        builder.pushHandler(...this.requestHandlers);
        builder.pushHandler(defaultContainerRequestHandler());

        const runtime = await ContainerRuntime.load(
            context,
            this.registry,
            async (req, rt) => builder.handleRequest(req, rt),
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
