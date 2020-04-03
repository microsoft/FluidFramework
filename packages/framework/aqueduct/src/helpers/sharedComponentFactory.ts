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
    IComponentRuntime,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

// eslint-disable-next-line import/no-internal-modules
import { SharedComponent } from "../components/sharedComponent";
import {
    IComponentModuleManager,
    ModuleManager,
    Scope,
} from "../container-modules";

import { IComponentFoo } from "./IComponentFoo";

export class Foo implements IComponentFoo {
    public get IComponentFoo() { return this; }
    public foo() {
        alert("foo ya!");
    }
}

export class SharedComponentFactory<T extends SharedComponent, O extends IComponent, R  extends IComponent>
implements IComponentFactory, Partial<IProvideComponentRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime,
            context: IComponentContext,
            scope: Scope<O, R>) => T,
        private readonly optionalModuleTypes: Record<keyof O & keyof IComponent, keyof O & keyof IComponent>,
        private readonly requiredModuleTypes: Record<keyof R & keyof IComponent, keyof R & keyof IComponent>,
        sharedObjects: readonly ISharedObjectFactory[],
        registryEntries?: NamedComponentRegistryEntries,
        private readonly onDemandInstantiation = true,
        public readonly type: string = "",
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

        const moduleManager = context.scope.IComponentModuleManager ?? new ModuleManager();

        let instanceP: Promise<SharedComponent>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context, moduleManager);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context, moduleManager);
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
        moduleManager: IComponentModuleManager) {

        // Dynamically generate our scope object
        const scope = moduleManager.resolve<O, R>(this.optionalModuleTypes, this.requiredModuleTypes);
        // Create a new instance of our component
        const instance = new this.ctor(runtime, context, scope);
        await instance.initialize();
        return instance;
    }

    public async createComponent(context: IComponentContext): Promise<IComponent & IComponentLoadable> {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        // Check to ensure the required modules are available in the Container before attempting create.
        if (!this.canCreateComponent(context)){
            throw new Error("Failed to create Component because required Container Modules are missing");
        }

        return context.createComponentWithRealizationFn(
            this.type,
            (newContext) => { this.instantiateComponent(newContext); },
        );
    }

    public canCreateComponent(context: IComponentContext): boolean {
        const requiredModules = Object.values(this.requiredModuleTypes);
        if (!requiredModules){
            // If there are no required modules then scope creation will work at runtime.
            return true;
        }

        // If there are required modules we need to check to ensure the container has provided them
        const containerModuleManager = context.scope.IComponentModuleManager;
        if (!containerModuleManager){
            // If we have required modules but no module manager we will fail creation
            return false;
        }

        // See if all the types are there
        return containerModuleManager.has(requiredModules);
    }
}
