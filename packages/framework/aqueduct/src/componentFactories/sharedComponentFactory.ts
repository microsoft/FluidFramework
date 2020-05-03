/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ComponentRegistry } from "@microsoft/fluid-container-runtime";
// import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
    NamedComponentRegistryEntry,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import {
    ComponentSymbolProvider,
    DependencyContainer,
} from "@microsoft/fluid-synthesize";

import {
    ISharedComponentProps,
    SharedComponent,
} from "../components";

/**
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
        sharedObjects: readonly ISharedObjectFactory[],
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

    public get registryEntry(): NamedComponentRegistryEntry {
        return [this.type, Promise.resolve(this)];
    }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a component runtime
     */
    public instantiateComponent(context: IComponentContext): void {
        this.instantiateComponentWithInitialState(context, undefined);
    }

    private instantiateComponentWithInitialState(
        context: IComponentContext,
        initialState?: S): void {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = ComponentRuntime.load(
            context,
            this.sharedObjectRegistry,
            this.registry,
        );

        let instanceP: Promise<SharedComponent>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context, initialState);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context, initialState);
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
        initialState?: S,
    ) {
        const dependencyContainer = new DependencyContainer(context.scope.IComponentDependencySynthesizer);
        /*
        TODO: REVIEW!!!
        // If the Container did not register the IContainerRuntime we can do it here to make sure services that need
        // it will have it.
        if (!dependencyContainer.has(IContainerRuntime)) {
            dependencyContainer.register(IContainerRuntime, context.containerRuntime);
        }
        */
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our component
        const instance = new this.ctor({ runtime, context, providers });
        await instance.initialize(initialState);
        return instance;
    }

    public async createComponent(
        context: IComponentContext,
        initialState?: S,
    ): Promise<IComponent & IComponentLoadable> {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        return context.createComponentWithRealizationFn(
            this.type,
            (newContext) => { this.instantiateComponentWithInitialState(newContext, initialState); },
        );
    }
}
