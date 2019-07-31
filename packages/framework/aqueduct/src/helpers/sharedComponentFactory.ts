/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IRequest,
} from "@prague/component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@prague/component-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import {
    ISharedObjectExtension,
} from "@prague/shared-object-common";
import { initializeKey, SharedComponent } from "../components/sharedComponent";

export class SharedComponentFactory implements IComponent, IComponentFactory  {
    public static supportedInterfaces = ["IComponentFactory"];
    private readonly registry: ISharedObjectRegistry;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: ReadonlyArray<ISharedObjectExtension>,
    ) {
        this.registry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

    public query(id: string): any {
        return SharedComponentFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SharedComponentFactory.supportedInterfaces;
    }

    /**
     * This is where we do component setup.
     */
    public instantiateComponent(context: IComponentContext): void {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        ComponentRuntime.load(
            context,
            this.registry,
            (runtime) => {
                // Create a new instance of our component
                const instance = new this.ctor(runtime, context);
                const initializedP = instance[initializeKey]();

                runtime.registerRequestHandler(async (request: IRequest) => {
                    await initializedP;
                    return instance.request(request);
                });
            });
    }
}
