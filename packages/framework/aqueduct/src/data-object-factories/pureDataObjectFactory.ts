/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 import assert from "assert";
import { IRequest, IFluidObject } from "@fluidframework/core-interfaces";
import {
    FluidDataStoreRuntime,
    ISharedObjectRegistry,
    requestFluidDataStoreMixin,
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
} from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    FluidObjectSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";

import {
    IDataObjectProps,
    PureDataObject,
} from "../data-objects";

function buildRegistryPath(
    context: IFluidDataStoreContext,
    factory: IFluidDataStoreFactory)
{
    const parentPath = context.packagePath;
    assert(parentPath.length > 0);
    // A factory could not contain the registry for itself. So if it is the same the last snapshot
    // pkg, return our package path.
    assert(parentPath[parentPath.length - 1] !== factory.type);
    return [...parentPath, factory.type];
}

/*
 * This interface is exposed by data store objects to create sub-objects.
 * It assumes that factories passed in to methods of this interface are present in registry of object's context
 * that is represented by this interface.
 */
export interface IFluidDataObjectFactory {
    /**
     * Creates a new child instance of the object. Uses PureDataObjectFactory for that, and thus we
     * have type information about object created and can pass in initia state.
     * @param initialState - The initial state to provide to the created component.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    createChildInstance<
        TObject extends PureDataObject<O, S, E>,
        TFactory extends PureDataObjectFactory<TObject, O, S, E>,
        O, S, E extends IEvent = IEvent>
    (subFactory: TFactory, initialState?: S): Promise<TObject>;

    /**
     * Similar to above, but uses any data store factory. Given that there is no type information about such factory
     * (or objects it creates, hanse "Anonymous" in name), IFluidObject (by default) is returned by doing a request
     * to created data store.
     */
    createAnonymousChildInstance<T = IFluidObject>(
        subFactory: IFluidDataStoreFactory,
        request?: string | IRequest): Promise<T>;
}

/**
 * An implementation of IFluidDataObjectFactory for PureDataObjectFactory's objects (i.e. PureDataObject).
 */
class FluidDataObjectFactory {
    constructor(private readonly context: IFluidDataStoreContext) {
    }

    public async createChildInstance<
        TObject extends PureDataObject<O, S, E>,
        TFactory extends PureDataObjectFactory<TObject, O, S, E>,
        O, S, E extends IEvent = IEvent>(subFactory: TFactory, initialState?: S)
    {
        return subFactory.createChildInstance(this.context, initialState);
    }

    public async createAnonymousChildInstance<T = IFluidObject>(
        subFactory: IFluidDataStoreFactory,
        request: string | IRequest = "/")
    {
        const packagePath = buildRegistryPath(this.context, subFactory);
        const factory2 = await this.context.IFluidDataStoreRegistry?.get(subFactory.type);
        assert(factory2 === subFactory);
            const router = await this.context.containerRuntime.createDataStore(packagePath);
        return requestFluidObject<T>(router, request);
    }
}

export const getFluidObjectFactoryFromInstance = (context: IFluidDataStoreContext) =>
    new FluidDataObjectFactory(context) as IFluidDataObjectFactory;

/**
 * Proxy over PureDataObject
 * Does delayed creation & initialization of PureDataObject
*/
async function createDataObject<TObj extends PureDataObject<O, S, E>, O, S, E extends IEvent = IEvent>(
    ctor: new (props: IDataObjectProps<O, S>) => TObj,
    context: IFluidDataStoreContext,
    sharedObjectRegistry: ISharedObjectRegistry,
    optionalProviders: FluidObjectSymbolProvider<O>,
    runtimeFactoryArg: typeof FluidDataStoreRuntime,
    initProps?: S)
{
    // base
    let runtimeFactory = runtimeFactoryArg;

    // request mixin in
    runtimeFactory = requestFluidDataStoreMixin(
        runtimeFactory,
        async (request: IRequest, runtimeArg: FluidDataStoreRuntime) =>
            (await PureDataObject.getDataObject(runtimeArg)).request(request));

    // Create a new runtime for our data store
    // The runtime is what Fluid uses to create DDS' and route to your data store
    const runtime = new runtimeFactory(
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
 * Generics:
 * TObj - DataObject (concrete type)
 * O - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data store may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export class PureDataObjectFactory<TObj extends PureDataObject<O, S, E>, O, S, E extends IEvent = IEvent>
    implements IFluidDataStoreFactory, Partial<IProvideFluidDataStoreRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: IDataObjectProps<O, S>) => TObj,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: FluidObjectSymbolProvider<O>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        private readonly runtimeCtor: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
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
            this.runtimeCtor);

        return runtime;
    }

   /**
    * Takes context, and creates package path for a sub-entry (represented by factory in context registry).
    * Package path returned is used to reach given factory from root (container runtime) registry, and thus
    * is used to serialize and de-serialize data store that this factory would create.
    * Function validates that given factory is present in registry, otherwise it throws.
    */
   protected buildRegistryPath(
       context: IFluidDataStoreContext | IContainerRuntimeBase)
   {
       let packagePath: string[];
       if ("containerRuntime" in context) {
           packagePath = buildRegistryPath(context, this);
       } else {
           packagePath = [this.type];
       }

       return packagePath;
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
        const packagePath = buildRegistryPath(parentContext, this);
        return this.createInstanceCore(parentContext.containerRuntime, packagePath, initialState);
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
        return this.createInstanceCore(peerContext.containerRuntime, peerContext.packagePath, initialState);
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
        return this.createInstanceCore(runtime, [this.type], initialState);
    }

    protected async createInstanceCore(
        containerRuntime: IContainerRuntimeBase,
        packagePath: Readonly<string[]>,
        initialState?: S,
    ): Promise<TObj> {
        const newContext = containerRuntime.createDetachedDataStore();

        const { instance, runtime } = await createDataObject(
            this.ctor,
            newContext,
            this.sharedObjectRegistry,
            this.optionalProviders,
            this.runtimeCtor,
            initialState);

        await newContext.attachRuntime(packagePath, this, runtime);

        return instance;
    }
}
