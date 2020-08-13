/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IFluidObject } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import { FluidDataStoreRegistry, buildSubPath } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IContainerRuntimeBase,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
    NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ComponentSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";

import {
    ISharedComponentProps,
    PureDataObject,
} from "../data-objects";

/*
 * An association of identifiers to component registry entries, where the
 * entries can be used to create components.
 */
export interface IFluidDataObjectFactory {
    createInstance<
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject, P,S>>
    (subFactory: TFactory, props?: S): Promise<TObject>;

    createAnonymousInstance<T = IFluidObject>(
        subFactory: IFluidDataStoreFactory,
        request?: string | IRequest): Promise<T>;
}

class FluidDataObjectFactory {
    constructor(private readonly context: IFluidDataStoreContext) {
    }

    public async createInstance<
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject,P,S>>(subFactory: TFactory, props?: S)
    {
        return subFactory.createInstance(this.context, props);
    }

    public async createAnonymousInstance<T = IFluidObject>(
        subFactory: IFluidDataStoreFactory,
        request: string | IRequest = "/")
    {
        const packagePath = await buildSubPath(this.context, subFactory);
        const router = await this.context.containerRuntime.createDataStore(packagePath);
        return requestFluidObject<T>(router, request);
    }
}

export const getFluidObjectFactoryFromInstance = (context: IFluidDataStoreContext) =>
    new FluidDataObjectFactory(context);

/**
 * PureDataObjectFactory is a barebones IFluidDataStoreFactory for use with PureDataObject.
 * Consumers should typically use DataObjectFactory instead unless creating
 * another base component factory.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 */
export class PureDataObjectFactory<TObj extends PureDataObject<P, S>, P, S>
    implements IFluidDataStoreFactory, Partial<IProvideFluidDataStoreRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: ISharedComponentProps<P>) => TObj,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: ComponentSymbolProvider<P>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        private readonly onDemandInstantiation = true,
    ) {
        // empty string is not allowed!
        if (!this.type) {
            throw new Error("undefined type member");
        }
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
     * Convenience helper to get the component's/factory's component registry entry.
     * The return type hides the factory's generics, easing grouping of registry
     * entries that differ only in this way into the same array.
     * @returns The NamedFluidDataStoreRegistryEntry
     */
    public get registryEntry(): NamedFluidDataStoreRegistryEntry {
        return [this.type, Promise.resolve(this)];
    }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a data store runtime
     */
    public async instantiateDataStore(context: IFluidDataStoreContext) {
        return this.instantiateDataStoreCore(context);
    }

        /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a data store runtime
     */
    protected instantiateDataStoreCore(context: IFluidDataStoreContext, props?: S) {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = FluidDataStoreRuntime.load(
            context,
            this.sharedObjectRegistry,
        );

        let instanceP: Promise<PureDataObject>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context, props);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context, props);
            }
            const instance = await instanceP;
            return instance.request(request);
        });

        return runtime;
    }

    /**
     * Instantiate and initialize the component object
     * @param runtime - data store runtime created for the component context
     * @param context - component context used to load a data store runtime
     */
    private async instantiateInstance(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
        props?: S,
    ) {
        const dependencyContainer = new DependencyContainer(context.scope.IFluidDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our component
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initializeInternal(props);
        return instance;
    }

    /**
     * Implementation of IFluidDataStoreFactory's createInstance method that also exposes an initial
     * state argument.  Only specific factory instances are intended to take initial state.
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @param initialState - The initial state to provide to the created component.
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    public async createInstance(
        parentContext: IFluidDataStoreContext | IContainerRuntimeBase,
        initialState?: S,
    ) {
        const containerRuntime = "containerRuntime" in parentContext ? parentContext.containerRuntime : parentContext;
        const newContext = containerRuntime.createDetachedDataStore();

        // const runtime = this.instantiateDataStoreCore(newContext, initialState);
        const runtime = FluidDataStoreRuntime.load(
            newContext,
            this.sharedObjectRegistry,
        );

        const instanceP = this.instantiateInstance(runtime, newContext, initialState);

        runtime.registerRequestHandler(async (request: IRequest) => {
            const instance = await instanceP;
            return instance.request(request);
        });

        await newContext.attachRuntime(parentContext, this, runtime);

        return instanceP;
    }
}
