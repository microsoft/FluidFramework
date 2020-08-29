/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 import assert from "assert";
import { IRequest, IFluidObject } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
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
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject, P,S>>
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
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject,P,S>>(subFactory: TFactory, initialState?: S)
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
 * PureDataObjectFactory is a barebones IFluidDataStoreFactory for use with PureDataObject.
 * Consumers should typically use DataObjectFactory instead unless creating
 * another base data store factory.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data store may take during creation
 */
export class PureDataObjectFactory<TObj extends PureDataObject<P, S>, P, S>
    implements IFluidDataStoreFactory, Partial<IProvideFluidDataStoreRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: IDataObjectProps<P>) => TObj,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: FluidObjectSymbolProvider<P>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        private readonly onDemandInstantiation = true,
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
        return this.instantiateDataStoreCore(context);
    }

    /**
     * Private method for data store instantiation that exposes initial state
     *
     * @param context - data store context used to load a data store runtime
     */
    protected instantiateDataStoreCore(context: IFluidDataStoreContext, props?: S) {
        // Create a new runtime for our data store
        // The runtime is what Fluid uses to create DDS' and route to your data store
        const runtime = FluidDataStoreRuntime.load(
            context,
            this.sharedObjectRegistry,
        );

        let instanceP: Promise<TObj>;
        // For new runtime, we need to force the data store instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context, props);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our data store on demand
                instanceP = this.instantiateInstance(runtime, context, props);
            }
            const instance = await instanceP;
            return instance.request(request);
        });

        return runtime;
    }

    /**
     * Instantiate and initialize the data store object
     * @param runtime - data store runtime created for the data store context
     * @param context - data store context used to load a data store runtime
     */
    private async instantiateInstance(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
        props?: S,
    ): Promise<TObj> {
        const dependencyContainer = new DependencyContainer(context.scope.IFluidDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our data store
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initializeInternal(props);
        return instance;
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
     * Creates a new instance of the object. Uses container's registry (root) to find this factory.
     * It's expected that only container owners would use this functionality, as only such developers
     * have knowledge of root entries in container registry.
     * The name in this registry for such record should match type of this factory.
     * @param runtime - container runtime. It's registry is used to create an object.
     * @param initialState - The initial state to provide to the created component.
     * @returns an object created by this factory. Data store and objects created are not attached to container.
     * They get attached only when a handle to one of them is attached to already attached objects.
     */
    public async createRootInstance(
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

        const runtime = FluidDataStoreRuntime.load(
            newContext,
            this.sharedObjectRegistry,
        );

        const instanceP = this.instantiateInstance(runtime, newContext, initialState);

        runtime.registerRequestHandler(async (request: IRequest) => {
            const instance = await instanceP;
            return instance.request(request);
        });

        await newContext.attachRuntime(packagePath, this, runtime);

        return instanceP;
    }
}
