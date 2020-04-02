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
import { Scope } from "../container-modules";

export class SharedComponentFactory<T extends SharedComponent, O extends IComponent, R  extends IComponent>
implements IComponentFactory, Partial<IProvideComponentRegistry>
{
    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime,
            context: IComponentContext,
            scope: Scope<O, R>) => T,
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

        let instanceP: Promise<SharedComponent>;
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
    private async instantiateInstance(runtime: ComponentRuntime, context: IComponentContext) {
        // Create a new instance of our component
        const instance = new this.ctor(runtime, context, {} as any);
        await instance.initialize();
        return instance;
    }

    public async createComponent(context: IComponentContext): Promise<IComponent & IComponentLoadable> {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        return context.createComponentWithRealizationFn(
            this.type,
            (newContext) => { this.instantiateComponent(newContext); },
        );
    }
}
