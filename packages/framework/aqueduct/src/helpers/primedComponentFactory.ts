/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DirectoryFactory, MapFactory, SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedComponent } from "../components";
import { SharedComponentFactory } from "./sharedComponentFactory";

export class PrimedComponentFactory extends SharedComponentFactory {
    constructor(
        ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: readonly ISharedObjectFactory[] = [],
        registryEntries?: NamedComponentRegistryEntries,
        onDemandInstantiation = true,
        type: string = "",
    ) {
        const mergedObjects = [...sharedObjects];

        if (!sharedObjects.find((factory) => factory.type === DirectoryFactory.Type)) {
            // User did not register for directory
            mergedObjects.push(SharedDirectory.getFactory());
        }

        // TODO: Remove SharedMap factory when compatibility with SharedMap PrimedComponent is no longer needed in 0.10
        if (!sharedObjects.find((factory) => factory.type === MapFactory.Type)) {
            // User did not register for map
            mergedObjects.push(SharedMap.getFactory());
        }

        super(ctor, mergedObjects, registryEntries, onDemandInstantiation, type);
    }
}
