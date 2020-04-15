/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ComponentRegistry } from "@microsoft/fluid-container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
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
import { ComponentCtor } from "../types";

export class SharedComponentFactory<O extends IComponent, R extends IComponent>
implements IComponentFactory, Partial<IProvideComponentRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;
    private readonly dependencyContainer: DependencyContainer;

    constructor(
        public readonly type: string,
        private readonly ctor: ComponentCtor<O,R, SharedComponent<O,R>>,
        sharedObjects: readonly ISharedObjectFactory[],
        private readonly optionalProviders: ComponentSymbolProvider<O>,
        private readonly requiredProviders: ComponentSymbolProvider<R>,
        registryEntries?: NamedComponentRegistryEntries,
        private readonly onDemandInstantiation = true,
    ) {
        if (registryEntries !== undefined) {
            this.registry = new ComponentRegistry(registryEntries);
        }
        this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));

        this.dependencyContainer = new DependencyContainer(undefined);
    }

    public get IComponentFactory() { return this; }

    public get IComponentRegistry() {
        return this.registry;
    }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a component runtime
     */
    public instantiateComponent(context: IComponentContext): void {
        this.instantiateComponentWithConstructorFn(context, undefined);
    }

    private instantiateComponentWithConstructorFn(
        context: IComponentContext,
        ctorFn?: (props: ISharedComponentProps) => SharedComponent) {
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
            instanceP = this.instantiateInstance(runtime, context, ctorFn);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context, ctorFn);
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
        ctorFn?: (props: ISharedComponentProps) => SharedComponent,
    ) {
        const providers = this.dependencyContainer.synthesize<O, R>(this.optionalProviders,this.requiredProviders);
        // Create a new instance of our component
        const instance = ctorFn ? ctorFn({runtime, context, providers}) : new this.ctor({runtime, context, providers});
        await instance.initialize();
        return instance;
    }

    public async createComponent(context: IComponentContext): Promise<IComponent & IComponentLoadable> {
        return this.createComponentWithConstructorFn(context, undefined);
    }

    protected async createComponentWithConstructorFn(
        context: IComponentContext,
        ctorFn?: (props: ISharedComponentProps) => SharedComponent,
    ): Promise<IComponent & IComponentLoadable> {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        return context.createComponentWithRealizationFn(
            this.type,
            (newContext) => { this.instantiateComponentWithConstructorFn(newContext, ctorFn); },
        );
    }
}
