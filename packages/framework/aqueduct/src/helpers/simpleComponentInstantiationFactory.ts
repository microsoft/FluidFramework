/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IRequest,
} from "@prague/container-definitions";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRouter,
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

    public query(id: string): any {
        return SimpleComponentInstantiationFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SimpleComponentInstantiationFactory.supportedInterfaces;
    }

    /**
     * This is where we do component setup.
     */
    public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
        // Create a map of all the supported Distributed Data Structures
        const dataTypes = new Map<string, ISharedObjectExtension>();
        this.sharedObjects.forEach((sharedObject) => {
            dataTypes.set(sharedObject.type, sharedObject);
        });

        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = await ComponentRuntime.load(context, dataTypes);

        // Create a new instance of our component
        const componentP = this.entryPoint(runtime, context);

        // This will get called anytime a request({url: string}) call is made to the container
        // where the url is our unique component id.
        // We leverage this to return our instance of the component.
        runtime.registerRequestHandler(async (request: IRequest) => {
        const component = await componentP;
        return component.request(request);
        });

        return runtime;
    }
}
