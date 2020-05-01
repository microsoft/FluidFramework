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

import { PrimedComponent, ISharedComponentProps } from "../components";
import { SharedComponentFactory } from "./sharedComponentFactory";

/**
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 */
export class PrimedComponentFactory<
    P extends IComponent = object,
    S = undefined>
    extends SharedComponentFactory<P, S>
{
    constructor(
        type: string,
        ctor: new (props: ISharedComponentProps<P>) => PrimedComponent<P, S>,
        sharedObjects: readonly ISharedObjectFactory[] = [],
        optionalProviders: ComponentSymbolProvider<P>,
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
