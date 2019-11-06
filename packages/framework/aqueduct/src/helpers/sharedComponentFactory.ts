/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ComponentRegistry } from "@microsoft/fluid-container-runtime";
import { IComponentContext, IComponentFactory, IComponentRegistry, IComponentRuntime, IProvideComponentRegistry, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedComponent } from "../components/sharedComponent";

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentCreator>> {
    }
}

export interface IProvideComponentCreator {
    readonly IComponentCreator: IComponentCreator;
}

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentCreator extends IProvideComponentCreator {
    createComponent(context: IComponentContext): Promise<IComponent>;
}

export class SharedComponentFactory implements IComponentFactory, Partial<IProvideComponentRegistry>, IComponentCreator {

    // TODO: This is here for now but should be piped through.
    public registryName: string = "";

    public readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: ReadonlyArray<ISharedObjectFactory>,
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

    public get IComponentCreator(): IComponentCreator { return this; }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a component runtime
     */
    public instantiateComponent(context: IComponentContext): void {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        ComponentRuntime.load(
            context,
            this.sharedObjectRegistry,
            (runtime: ComponentRuntime) => {
                let instanceP: Promise<SharedComponent>;
                // For new runtime, we need to force the component instance to be create
                // run the initialization.
                if (!this.onDemandInstantiation || !runtime.existing) {
                    // Create a new instance of our component up front
                    instanceP = this.instantiateInstance(runtime, context);
                }

                runtime.registerRequestHandler(async (request: IRequest) => {
                    if (!instanceP) {
                        // Create a new instance of our component on demand
                        instanceP = this.instantiateInstance(runtime, context);
                    }
                    const instance = await instanceP;
                    return instance.request(request);
                });
            },
            this.registry,
        );
    }

    public async createComponent(context: IComponentContext): Promise<IComponent> {
        const cr = await context.hostRuntime.createComponentDirect(this.registryName, (c) => { this.instantiateComponent(c); });
        const response = await cr.request({url: "/"});
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error("Failed to create component");
        }

        cr.attach();
        return response.value as IComponent;
    }

    /**
     * Instantiate and initialize the component object
     * @param runtime - component runtime created for the component context
     * @param context - component context used to load a component runtime
     */
    private async instantiateInstance(runtime: ComponentRuntime, context: IComponentContext) {
        // Create a new instance of our component
        const instance = new this.ctor(runtime, context);
        await instance.initialize();
        return instance;
    }
}
