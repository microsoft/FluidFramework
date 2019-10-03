/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DirectoryFactory, MapFactory, SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import { ComponentRegistryTypes, IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedComponent } from "../components/sharedComponent";
import { SharedComponentFactory } from "./sharedComponentFactory";

export class PrimedComponentFactory extends SharedComponentFactory {
    constructor(
        ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: ReadonlyArray<ISharedObjectFactory>,
        componentRegistry?: ComponentRegistryTypes,
        onDemandInstantiation = true,
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

        super(ctor, mergedObjects, componentRegistry!, onDemandInstantiation);
    }
}
