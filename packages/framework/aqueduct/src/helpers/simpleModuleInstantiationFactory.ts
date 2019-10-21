/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { IComponentDefaultFactory } from "@microsoft/fluid-framework-interfaces";
import { ComponentFactoryTypes, ComponentRegistryTypes, IHostRuntime, IProvideComponentRegistry } from "@microsoft/fluid-runtime-definitions";
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
    IProvideComponentRegistry,
    IRuntimeFactory,
    IComponentDefaultFactory {

    constructor(
        private readonly defaultComponentName: string,
        private readonly registry: ComponentRegistryTypes) {
    }

    public get IComponentRegistry() { return this.registry; }
    public get IRuntimeFactory() { return this; }
    public get IComponentDefaultFactory() { return this; }

    public async getDefaultFactory(runtime: IHostRuntime): Promise<ComponentFactoryTypes> {
        return this.registry.get(this.defaultComponentName, runtime)!;
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
