/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentRouter,
    IRequest,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import {
    ISharedObjectExtension,
} from "@prague/shared-object-common";

/**
 * This Factory provides a simple helper for creating a component instantiation factory.
 * The `instantiateComponent` function will be called every time a unique component is loaded.
 *
 * Loading happens after creating a new component, after another person creates a new component, and
 * whenever the page loads.
 */
export class SimpleComponentInstantiationFactory implements IComponent, IComponentFactory  {
    public static supportedInterfaces = ["IComponentFactory"];

    constructor(
        private readonly sharedObjects: ISharedObjectExtension[],
        private readonly entryPoint: (runtime: IComponentRuntime, context: IComponentContext) => Promise<IComponentRouter>,
    ) {
    }

    public get IComponentFactory() { return this; }

    public query(id: string): any {
        return SimpleComponentInstantiationFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SimpleComponentInstantiationFactory.supportedInterfaces;
    }

    /**
     * This is where we do component setup.
     */
    public instantiateComponent(context: IComponentContext): void {
        // Create a map of all the supported Distributed Data Structures
        const dataTypes = new Map<string, ISharedObjectExtension>();
        this.sharedObjects.forEach((sharedObject) => {
            dataTypes.set(sharedObject.type, sharedObject);
        });

        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                // Create a new instance of our component
                const componentP = this.entryPoint(runtime, context);

                // This will get called anytime a request({url: string}) call is made to the container
                // where the url is our unique component id.
                // We leverage this to return our instance of the component.
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const component = await componentP;
                    return component.request(request);
                });
            });
    }
}
