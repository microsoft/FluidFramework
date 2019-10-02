/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { ComponentFactoryTypes, ComponentRegistryTypes, IComponentContext, IComponentFactory, IComponentRegistry } from "@microsoft/fluid-runtime-definitions";
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
    IComponentFactory {

    constructor(
        public readonly defaultComponentName: string,
        private readonly registry: ComponentRegistryTypes) {
    }

    public get IComponentFactory() { return this; }
    public get IComponentRegistry() { return this; }
    public get IRuntimeFactory() { return this; }

    public get(name: string): Promise<ComponentFactoryTypes> | undefined {
        return this.registry.get(name);
    }

    public instantiateComponent(context: IComponentContext): void {
        const factoryP = this.get(this.defaultComponentName);
        if (factoryP === undefined) {
            throw new Error(`No component factory for ${this.defaultComponentName}`);
        }
        factoryP.then(
            (factory) => {
                factory.instantiateComponent(context);
            },
            (error) => {
                context.error(error);
            });
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
