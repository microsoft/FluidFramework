/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import {
    DirectoryFactory,
    MapFactory,
    SharedDirectory,
    SharedMap,
} from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import {
    ISharedObjectFactory,
} from "@microsoft/fluid-shared-object-base";
import { PrimedComponent } from "../components/primedComponent";

export class PrimedComponentFactory implements IComponentFactory {
    private readonly registry: ISharedObjectRegistry;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime, context: IComponentContext) => PrimedComponent,
        sharedObjects: ReadonlyArray<ISharedObjectFactory>,
        private readonly onDemandInstantiation = true,
    ) {
        const mergedObjects = [...sharedObjects];

        if (!sharedObjects.find((factory) => {
            return factory.type === DirectoryFactory.Type;
        })) {
            // User did not register for directory
            mergedObjects.push(SharedDirectory.getFactory());
        }

        // TODO: Remove SharedMap factory when compatibility with SharedMap PrimedComponent is no longer needed in 0.10
        if (!sharedObjects.find((factory) => {
            return factory.type === MapFactory.Type;
        })) {
            // User did not register for map
            mergedObjects.push(SharedMap.getFactory());
        }

        this.registry = new Map(mergedObjects.map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

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
            this.registry,
            (runtime: ComponentRuntime) => {
                let instanceP: Promise<PrimedComponent>;
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
