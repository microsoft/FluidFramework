/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { DirectoryFactory, MapFactory, SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

import { PrimedComponent } from "../components";
import { Scope } from "../container-modules";
import { SharedComponentFactory } from "./sharedComponentFactory";

export class PrimedComponentFactory<T extends PrimedComponent, O extends IComponent, R extends IComponent>
    extends SharedComponentFactory<T, O, R>
{
    constructor(
        ctor: new (runtime: IComponentRuntime,
            context: IComponentContext,
            scope: Scope<O, R>,
        ) => T,
        optionalModuleTypes: Record<keyof O & keyof IComponent, keyof O & keyof IComponent>,
        requiredModuleTypes: Record<keyof R & keyof IComponent, keyof R & keyof IComponent>,
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

        super(ctor,
            optionalModuleTypes,
            requiredModuleTypes,
            mergedObjects,
            registryEntries,
            onDemandInstantiation,
            type);
    }
}
