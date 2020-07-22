/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable, IRequest } from "@fluidframework/component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@fluidframework/component-runtime";
import { ComponentRegistry } from "@fluidframework/container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
    NamedComponentRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/component-runtime-definitions";
import {
    ComponentSymbolProvider,
    DependencyContainer,
} from "@fluidframework/synthesize";

import {
    ISharedComponentProps,
    SharedComponent,
    createComponentHelper,
} from "../components";

/**
 * SharedComponentFactory is a barebones IComponentFactory for use with SharedComponent.
 * Consumers should typically use PrimedComponentFactory instead unless creating
 * another base component factory.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 */
export class SharedComponentFactory<P extends IComponent, S = undefined> implements
    IComponentFactory,
    Partial<IProvideComponentRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (props: ISharedComponentProps<P>) => SharedComponent<P, S>,
        sharedObjects: readonly IChannelFactory[],
        private readonly optionalProviders: ComponentSymbolProvider<P>,
        registryEntries?: NamedComponentRegistryEntries,
        private readonly onDemandInstantiation = true,
    ) {
        if (registryEntries !== undefined) {
            this.registry = new ComponentRegistry(registryEntries);
        }
        this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

    public get IComponentRegistry() {
        return this.registry;
    }

    /**
     * Convenience helper to get the component's/factory's component registry entry.
     * The return type hides the factory's generics, easing grouping of registry
     * entries that differ only in this way into the same array.
     * @returns The NamedComponentRegistryEntry
     */
    public get registryEntry(): NamedComponentRegistryEntry {
        return [this.type, Promise.resolve(this)];
    }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a component runtime
     */
    public instantiateComponent(context: IComponentContext): void {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = ComponentRuntime.load(
            context,
            this.sharedObjectRegistry,
            this.registry,
        );

        let instanceP: Promise<SharedComponent<P, S>>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context);
            }
            const instance = await instanceP;
            return instance.request(request);
        });
    }

    /**
     * Instantiate and initialize the component object
     * @param runtime - component runtime created for the component context
     * @param context - component context used to load a component runtime
     */
    private async instantiateInstance(
        runtime: ComponentRuntime,
        context: IComponentContext,
    ) {
        const dependencyContainer = new DependencyContainer(context.scope.IComponentDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our component
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initialize();
        return instance;
    }

    /**
     * Implementation of IComponentFactory's createComponent method that also exposes an initial
     * state argument.  Only specific factory instances are intended to take initial state.
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @param initialState - The initial state to provide to the created component.
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    public async createComponent(
        context: IComponentContext,
        initialState?: S,
    ): Promise<IComponent & IComponentLoadable> {
        return createComponentHelper<S>(this.type, context, false, initialState);
    }
}
