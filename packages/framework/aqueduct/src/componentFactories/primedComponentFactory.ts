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

import { AqueductComponentCtor, PrimedComponent } from "../components";
import { SharedComponentFactory } from "./sharedComponentFactory";

export class PrimedComponentFactory<O extends IComponent = {}, R extends IComponent = {}>
    extends SharedComponentFactory<O,R>
{
    constructor(
        type: string,
        ctor: AqueductComponentCtor<O,R, PrimedComponent<O,R>>,
        sharedObjects: readonly ISharedObjectFactory[] = [],
        optionalProviders: ComponentSymbolProvider<O>,
        requiredProviders: ComponentSymbolProvider<R>,
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
            requiredProviders,
            registryEntries,
            onDemandInstantiation,
        );
    }
}
