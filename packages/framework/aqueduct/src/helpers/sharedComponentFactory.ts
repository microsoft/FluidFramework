/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ComponentRegistryTypes, IComponentContext, IComponentFactory, IComponentRegistry, IComponentRuntime, IProvideComponentRegistry } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedComponent } from "../components/sharedComponent";

export class SharedComponentFactory implements IComponentFactory, IProvideComponentRegistry  {
    private readonly sharedObjectRegistry: ISharedObjectRegistry;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: ReadonlyArray<ISharedObjectFactory>,
        private readonly componentRegistry: ComponentRegistryTypes,
        private readonly onDemandInstantiation = true,
    ) {
        this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

    public get IComponentRegistry(): IComponentRegistry {
        return this.componentRegistry as IComponentRegistry;
    }

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
        );
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
