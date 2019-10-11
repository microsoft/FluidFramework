/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { ComponentFactoryTypes, ComponentRegistryTypes, IComponentFactory, IComponentRegistry, IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SimpleContainerRuntimeFactory } from "./simpleContainerRuntimeFactory";

/**
 *  Simple Fluid Module instantiation library. This should be exposed as fluidExport off the entrypoint to your module
 *
 * This factory exposes the following interfaces:
 *  IComponentFactory: instantiates the default component directly, sub-components must be registered manually
 *  IRuntimeFactory: instantiates a container runtime that includes the default component and sub-components
 *  IComponentRegistry: instantiates a component registry that include the default component and sub-components
 */
export class SimpleModuleInstantiationFactory implements
    IComponent,
    IRuntimeFactory,
    IComponentRegistry,
    IProvideComponentFactory {

    constructor(
        private readonly defaultComponentName: string,
        private readonly defaultComponentFactory: IComponentFactory,
        private readonly registry: ComponentRegistryTypes) {
    }

    public get IComponentFactory() {
        return this.defaultComponentFactory;
    }
    public get IComponentRegistry() { return this; }
    public get IRuntimeFactory() { return this; }

    public get(name: string): Promise<ComponentFactoryTypes> | undefined {
        return this.registry.get(name);
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return SimpleContainerRuntimeFactory.instantiateRuntime(
            context,
            this.defaultComponentName,
            this.registry,
            true,
        );
    }
}
