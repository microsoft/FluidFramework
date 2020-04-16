/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
} from "@microsoft/fluid-component-core-interfaces";
import {
    DirectoryFactory,
    MapFactory,
    SharedDirectory,
    SharedMap,
} from "@microsoft/fluid-map";
import {
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { ComponentSymbolProvider } from "@microsoft/fluid-synthesize";

import { PrimedComponent } from "../components";
import { ComponentCtor } from "../types";
import { SharedComponentFactory } from "./sharedComponentFactory";

export class PrimedComponentFactory<O extends IComponent = object>
    extends SharedComponentFactory<O>
{
    constructor(
        type: string,
        ctor: ComponentCtor<O, PrimedComponent<O>>,
        sharedObjects: readonly ISharedObjectFactory[] = [],
        optionalProviders: ComponentSymbolProvider<O>,
        registryEntries?: NamedComponentRegistryEntries,
        onDemandInstantiation = true,
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

        super(
            type,
            ctor,
            mergedObjects,
            optionalProviders,
            registryEntries,
            onDemandInstantiation,
        );
    }
}
