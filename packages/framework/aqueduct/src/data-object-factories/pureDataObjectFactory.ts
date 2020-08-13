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
    ComponentSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";

import {
    ISharedComponentProps,
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
 * An association of identifiers to component registry entries, where the
 * entries can be used to create components.
 */
export interface IFluidDataObjectFactory {
    createChildInstance<
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject, P,S>>
    (subFactory: TFactory, props?: S): Promise<TObject>;

    createAnonymousChildInstance<T = IFluidObject>(
        subFactory: IFluidDataStoreFactory,
        request?: string | IRequest): Promise<T>;
}

class FluidDataObjectFactory {
    constructor(private readonly context: IFluidDataStoreContext) {
    }

    public async createChildInstance<
        P,
        S,
        TObject extends PureDataObject<P,S>,
        TFactory extends PureDataObjectFactory<TObject,P,S>>(subFactory: TFactory, props?: S)
    {
        return subFactory.createChildInstance(this.context, props);
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

        let instanceP: Promise<TObj>;
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
    ): Promise<TObj> {
        const dependencyContainer = new DependencyContainer(context.scope.IFluidDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our component
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initializeInternal(props);
        return instance;
    }

    /**
     * Takes context, and creates package path for a sub-entry (represented by factory) in context registry.
     * Package path returned is used to reach given factory from root (container runtime) registry, and thus
     * is used to serizlize and de-serialize future data store that such factory would create in future.
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
     * Implementation of IFluidDataStoreFactory's createInstance method that also exposes an initial
     * state argument.  Only specific factory instances are intended to take initial state.
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @param initialState - The initial state to provide to the created component.
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    public async createChildInstance(
        parentContext: IFluidDataStoreContext,
        initialState?: S,
    ): Promise<TObj> {
        const packagePath = buildRegistryPath(parentContext, this);
        return this.createInstanceCore(parentContext.containerRuntime, packagePath, initialState);
    }

    public async createPeerInstance(
        peerContext: IFluidDataStoreContext,
        initialState?: S,
    ): Promise<TObj> {
        return this.createInstanceCore(peerContext.containerRuntime, peerContext.packagePath, initialState);
    }

    public async createRootInstance(
        runtime: IContainerRuntimeBase,
        initialState?: S,
    ): Promise<TObj> {
        return this.createInstanceCore(runtime, [this.type], initialState);
    }

    public async createInstanceCore(
        containerRuntime: IContainerRuntimeBase,
        packagePath: Readonly<string[]>,
        initialState?: S,
    ): Promise<TObj> {
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

        await newContext.attachRuntime(packagePath, this, runtime);

        return instanceP;
    }
}
