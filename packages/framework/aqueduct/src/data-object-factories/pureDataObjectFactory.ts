/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject, IFluidLoadable, IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
    NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import {
    FluidObjectSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    IDataObjectProps,
    PureDataObject,
} from "../data-objects";

/**
 * PureDataObjectFactory is a barebones IFluidDataStoreFactory for use with PureDataObject.
 * Consumers should typically use DataObjectFactory instead unless creating
 * another base data store factory.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data store may take during creation
 */
export class PureDataObjectFactory<P extends IFluidObject, S = undefined> implements
    IFluidDataStoreFactory,
    Partial<IProvideFluidDataStoreRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: IDataObjectProps<P>) => PureDataObject<P, S>,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: FluidObjectSymbolProvider<P>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        private readonly onDemandInstantiation = true,
    ) {
        if (registryEntries !== undefined) {
            this.registry = new FluidDataStoreRegistry(registryEntries);
        }
        this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
    }

    public get IFluidDataStoreFactory() { return this; }

    public get IFluidDataStoreRegistry() {
        return this.registry;
    }

    /**
     * Convenience helper to get the data store's/factory's data store registry entry.
     * The return type hides the factory's generics, easing grouping of registry
     * entries that differ only in this way into the same array.
     * @returns The NamedFluidDataStoreRegistryEntry
     */
    public get registryEntry(): NamedFluidDataStoreRegistryEntry {
        return [this.type, Promise.resolve(this)];
    }

    /**
     * This is where we do data store setup.
     *
     * @param context - data store context used to load a data store runtime
     */
    public instantiateDataStore(context: IFluidDataStoreContext): void {
        this.instantiateDataStoreWithInitialState(context, undefined);
    }

    /**
     * Private method for data store instantiation that exposes initial state
     * @param context - data store context used to load a data store runtime
     * @param initialState  - The initial state to provide the created data store
     */
    private instantiateDataStoreWithInitialState(
        context: IFluidDataStoreContext,
        initialState?: S): void {
        // Create a new runtime for our data store
        // The runtime is what Fluid uses to create DDS' and route to your data store
        const runtime = FluidDataStoreRuntime.load(
            context,
            this.sharedObjectRegistry,
            this.registry,
        );

        let instanceP: Promise<PureDataObject>;
        // For new runtime, we need to force the data store instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our data store up front
            instanceP = this.instantiateInstance(runtime, context, initialState);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our data store on demand
                instanceP = this.instantiateInstance(runtime, context, initialState);
            }
            const instance = await instanceP;
            return instance.request(request);
        });
    }

    /**
     * Instantiate and initialize the data store object
     * @param runtime - data store runtime created for the data store context
     * @param context - data store context used to load a data store runtime
     */
    private async instantiateInstance(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
        initialState?: S,
    ) {
        const dependencyContainer = new DependencyContainer(context.scope.IFluidDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our data store
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initialize(initialState);
        return instance;
    }

    /**
     * Implementation of IFluidDataStoreFactory's createInstance method that also exposes an initial
     * state argument.  Only specific factory instances are intended to take initial state.
     * @param context - The data store context being used to create the data store
     * (the created data store will have its own new context created as well)
     * @param initialState - The initial state to provide to the created data store.
     * @returns A promise for a data store that will have been initialized. Caller is responsible
     * for attaching the data store to the provided runtime's container such as by storing its handle
     */
    public async createInstance(
        context: IFluidDataStoreContext,
        initialState?: S,
    ): Promise<IFluidObject & IFluidLoadable> {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        const packagePath = await context.composeSubpackagePath(this.type);

        const router = await context.containerRuntime.createDataStoreWithRealizationFn(
            packagePath,
            (newContext) => { this.instantiateDataStoreWithInitialState(newContext, initialState); },
        );

        return requestFluidObject<PureDataObject<P, S>>(router, "/");
    }
}
