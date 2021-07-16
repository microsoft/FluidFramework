/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IFluidRouter } from "@fluidframework/core-interfaces";
import {
    FluidDataStoreRuntime,
    ISharedObjectRegistry,
    mixinRequestHandler,
 } from "@fluidframework/datastore";
import { IEvent } from "@fluidframework/common-definitions";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IContainerRuntimeBase,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
    NamedFluidDataStoreRegistryEntry,
    IFluidDataStoreContextDetached,
} from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import {
    FluidObjectSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";

import {
    IDataObjectProps,
    PureDataObject,
} from "../data-objects";

/*
 * Useful interface in places where it's useful to do type erasure for PureDataObject generic
 */
export interface IRootDataObjectFactory extends IFluidDataStoreFactory {
    createRootInstance(
        rootDataStoreId: string,
        runtime: IContainerRuntime): Promise<IFluidRouter>;
}

/**
 * Proxy over PureDataObject
 * Does delayed creation & initialization of PureDataObject
*/
async function createDataObject<TObj extends PureDataObject<O, S, E>, O, S, E extends IEvent = IEvent>(
    ctor: new (props: IDataObjectProps<O, S>) => TObj,
    context: IFluidDataStoreContext,
    sharedObjectRegistry: ISharedObjectRegistry,
    optionalProviders: FluidObjectSymbolProvider<O>,
    runtimeClassArg: typeof FluidDataStoreRuntime,
    initProps?: S)
{
    // base
    let runtimeClass = runtimeClassArg;

    // request mixin in
    runtimeClass = mixinRequestHandler(
        async (request: IRequest, runtimeArg: FluidDataStoreRuntime) =>
            (await PureDataObject.getDataObject(runtimeArg)).request(request),
            runtimeClass);

    // Create a new runtime for our data store
    // The runtime is what Fluid uses to create DDS' and route to your data store
    const runtime = new runtimeClass(
        context,
        sharedObjectRegistry,
    );

    // Create object right away.
    // This allows object to register various callbacks with runtime before runtime
    // becomes globally available. But it's not full initialization - constructor can't
    // access DDSs or other services of runtime as objects are not fully initialized.
    // In order to use object, we need to go through full initialization by calling finishInitialization().
    const dependencyContainer = new DependencyContainer(context.scope.IFluidDependencySynthesizer);
    const providers = dependencyContainer.synthesize<O>(optionalProviders, {});
    const instance = new ctor({ runtime, context, providers, initProps });

    // if it's a newly created object, we need to wait for it to finish initialization
    // as that results in creation of DDSs, before it gets attached, providing atomic
    // guarantee of creation.
    // WARNING: we can't do the same (yet) for already existing PureDataObject!
    // This will result in deadlock, as it tries to resolve internal handles, but any
    // handle resolution goes through root (container runtime), which can't route it back
    // to this data store, as it's still not initialized and not known to container runtime yet.
    // In the future, we should address it by using relative paths for handles and be able to resolve
    // local DDSs while data store is not fully initialized.
    if (!runtime.existing) {
        await instance.finishInitialization();
    }

    return { instance, runtime };
}

/**
 * PureDataObjectFactory is a barebones IFluidDataStoreFactory for use with PureDataObject.
 * Consumers should typically use DataObjectFactory instead unless creating
 * another base data store factory.
 *
 * @typeParam TObj - DataObject (concrete type)
 * @typeParam O - represents a type that will define optional providers that will be injected
 * @typeParam S - the initial state type that the produced data object may take during creation
 * @typeParam E - represents events that will be available in the EventForwarder
 */
export class PureDataObjectFactory<TObj extends PureDataObject<O, S, E>, O, S, E extends IEvent = IEvent>
    implements IFluidDataStoreFactory, Partial<IProvideFluidDataStoreRegistry>, IRootDataObjectFactory
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: IDataObjectProps<O, S>) => TObj,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: FluidObjectSymbolProvider<O>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        private readonly runtimeClass: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
    ) {
        if (this.type === "") {
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
    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const { runtime } = await createDataObject(
            this.ctor,
            context,
            this.sharedObjectRegistry,
            this.optionalProviders,
            this.runtimeClass);

        return runtime;
    }

    /**
     * Creates a new instance of the object. Uses parent context's registry to build package path to this factory.
     * In other words, registry of context passed in has to contain this factory, with the name that matches
     * this factory's type.
     * It is intended to be used by data store objects that create sub-objects.
     * @param context - The context being used to create the runtime
     * (the created object will have its own new context created as well)
     * @param initialState - The initial state to provide to the created data store.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    public async createChildInstance(
        parentContext: IFluidDataStoreContext,
        initialState?: S,
    ): Promise<TObj> {
        return this.createNonRootInstanceCore(
            parentContext.containerRuntime,
            [...parentContext.packagePath, this.type],
            initialState);
    }

    /**
     * Creates a new instance of the object. Uses peer context's registry and its package path to identify this factory.
     * In other words, registry of context passed in has to have this factory.
     * Intended to be used by data store objects that need to create peers (similar) instances of existing objects.
     * @param context - The component context being used to create the object
     * (the created object will have its own new context created as well)
     * @param initialState - The initial state to provide to the created component.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    public async createPeerInstance(
        peerContext: IFluidDataStoreContext,
        initialState?: S,
    ): Promise<TObj> {
        return this.createNonRootInstanceCore(
            peerContext.containerRuntime,
            peerContext.packagePath,
            initialState);
    }

    /**
     * Creates a new instance of the object. Uses container's registry to find this factory.
     * It's expected that only container owners would use this functionality, as only such developers
     * have knowledge of entries in container registry.
     * The name in this registry for such record should match type of this factory.
     * @param runtime - container runtime. It's registry is used to create an object.
     * @param initialState - The initial state to provide to the created component.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    public async createInstance(
        runtime: IContainerRuntimeBase,
        initialState?: S,
    ): Promise<TObj> {
        return this.createNonRootInstanceCore(
            runtime,
            [this.type],
            initialState);
    }

    /**
     * Creates a new root instance of the object. Uses container's registry to find this factory.
     * It's expected that only container owners would use this functionality, as only such developers
     * have knowledge of entries in container registry.
     * The name in this registry for such record should match type of this factory.
     * @param runtime - container runtime. It's registry is used to create an object.
     * @param initialState - The initial state to provide to the created component.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    public async createRootInstance(
        rootDataStoreId: string,
        runtime: IContainerRuntime,
        initialState?: S,
    ): Promise<TObj> {
        const context = runtime.createDetachedRootDataStore([this.type], rootDataStoreId);
        return this.createInstanceCore(context, initialState);
    }

    protected async createNonRootInstanceCore(
        containerRuntime: IContainerRuntimeBase,
        packagePath: Readonly<string[]>,
        initialState?: S,
    ): Promise<TObj> {
        const context = containerRuntime.createDetachedDataStore(packagePath);
        return this.createInstanceCore(context, initialState);
    }

    protected async createInstanceCore(
        context: IFluidDataStoreContextDetached,
        initialState?: S,
    ): Promise<TObj> {
        const { instance, runtime } = await createDataObject(
            this.ctor,
            context,
            this.sharedObjectRegistry,
            this.optionalProviders,
            this.runtimeClass,
            initialState);

        await context.attachRuntime(this, runtime);

        return instance;
    }
}
