/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    buildRuntimeRequestHandler,
    RuntimeRequestHandler,
    innerRequestHandler,
    rootDataStoreRequestHandler,
} from "@fluidframework/request-handler";
import {
    NamedFluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
    FlushMode,
} from "@fluidframework/runtime-definitions";

const defaultStoreId = "" as const;

export class RuntimeFactory implements IRuntimeFactory {
    private readonly registry: NamedFluidDataStoreRegistryEntries;

    constructor(
        private readonly defaultStoreFactory: IFluidDataStoreFactory,
        storeFactories: IFluidDataStoreFactory[] = [defaultStoreFactory],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry =
            (storeFactories.includes(defaultStoreFactory)
                ? storeFactories
                : storeFactories.concat(defaultStoreFactory)
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries;
    }

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registry,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                innerRequestHandler),
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base data store
        if (!runtime.existing && this.defaultStoreFactory.type) {
            await runtime.createRootDataStore(this.defaultStoreFactory.type, defaultStoreId);
        }

        return runtime;
    }

    public async instantiateFirstTime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context, false);
        await runtime.createRootDataStore(this.defaultStoreFactory.type, defaultStoreId);
        return runtime;
    }

    public async instantiateFromExisting(context: IContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context, true);
        return runtime;
    }

    private async loadRuntime(context: IContainerContext, existing: boolean) {
        const runtime = await ContainerRuntime.loadStateful(
            context,
            this.registry,
            existing,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                rootDataStoreRequestHandler),
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);
        return runtime;
    }
}
