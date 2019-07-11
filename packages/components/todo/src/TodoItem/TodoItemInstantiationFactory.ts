/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    SharedCell,
} from "@prague/cell";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IRequest,
} from "@prague/container-definitions";
import {
    CounterValueType,
    SharedMap,
} from "@prague/map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import { TodoItem } from "./index";

/**
 * This Factory provides the entry for creating a new TodoItem Component.
 * The `instantiateComponent` function will be called every time a unique Todo component is loaded.
 *
 * Loading happens after creating a new component, after another person creates a new component, and
 * whenever the page loads.
 */
export class TodoItemInstantiationFactory implements IComponentFactory {
    public static supportedInterfaces = ["IComponentFactory", "IRuntimeFactory"];

    public query(id: string): any {
        return TodoItemInstantiationFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return TodoItemInstantiationFactory.supportedInterfaces;
    }

    /**
     * This is where we do component setup.
     */
    public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
        // Create a map that we will pass in our Distributed Data Structure (DDS) registry.
        // All DDS' used in this component must be registered at this time.
        // This is because if we are loading from a snapshot we need to know everything that could
        // exist in that snapshot
        const dataTypes = new Map<string, ISharedObjectExtension>();

        // Add Map DDS with Counter value type
        const mapValueTypes = [
        new CounterValueType(),
        ];
        const mapExtension = SharedMap.getFactory(mapValueTypes);
        dataTypes.set(mapExtension.type, mapExtension);

        // Add Cell DDS
        const cellExtension = SharedCell.getFactory();
        dataTypes.set(cellExtension.type, cellExtension);

        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = await ComponentRuntime.load(context, dataTypes);

        // Create a new instance of our component
        const counterNewP = TodoItem.load(runtime, context);

        // This will get called anytime a request({url: string}) call is made to the container
        // where the url is our unique component id.
        // We leverage this to return our instance of the component.
        runtime.registerRequestHandler(async (request: IRequest) => {
        const counter = await counterNewP;
        return counter.request(request);
        });

        return runtime;
    }
}
