/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
} from "@fluidframework/component-core-interfaces";
import { ComponentRuntime } from "@fluidframework/component-runtime";
import {
    DirectoryFactory,
    SharedDirectory,
} from "@fluidframework/map";
import {
    IComponentContext,
    NamedComponentRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { ComponentSymbolProvider, DependencyContainer } from "@fluidframework/synthesize";

import { ISharedComponentProps, SyncComponent } from "../components";
import { SharedComponentFactory } from "./sharedComponentFactory";

/**
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 */
export class SyncComponentFactory<
    P extends IComponent = object,
    S = undefined>
    extends SharedComponentFactory<P, S>
{
    constructor(
        type: string,
        ctor: new (props: ISharedComponentProps<P>) => SyncComponent<P, S>,
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

        super(
            type,
            ctor,
            mergedObjects,
            optionalProviders,
            registryEntries,
            onDemandInstantiation,
        );
    }

    public createComponentSync(
        context: IComponentContext,
        initialState?: S,
    ): SyncComponent {
        if (this.type === "") {
            throw new Error("undefined type member");
        }

        const { containerRuntime, packagePath } = context;
        const childContext = containerRuntime.createComponentContext(packagePath.concat(this.type));
        const childRuntime = ComponentRuntime.load(childContext, this.sharedObjectRegistry, this.IComponentRegistry);

        const dependencyContainer = new DependencyContainer(context.scope.IComponentDependencySynthesizer);
        const providers = dependencyContainer.synthesize<P>(this.optionalProviders, {});
        // Create a new instance of our component
        const props = { runtime: childRuntime, context: childContext, providers };
        const instance = new this.ctor(props) as SyncComponent<P, S>;
        instance.initializeSync(initialState);
        return instance;
    }
}
