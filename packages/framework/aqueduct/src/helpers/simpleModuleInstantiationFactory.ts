/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IComponent, IContainerContext, IRuntime, IRuntimeFactory,
} from "@prague/container-definitions";
import { IComponentRegistry } from "@prague/container-runtime";
import { IComponentContext, IComponentFactory } from "@prague/runtime-definitions";
import { SimpleContainerRuntimeFactory } from "./simpleContainerRuntimeFactory";

/**
 *  Simple Fluid Module instantiation library. This should be exposed as fuildExport off the entrypoint to your module
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
    private static readonly supportedInterfaces =
        ["IRuntimeFactory", "IComponentRegistry", "IComponentFactory"];

    constructor(
        private readonly defaultComponentName: string,
        private readonly registry: IComponentRegistry) {
    }

    public query(id: string): any {
        return SimpleModuleInstantiationFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SimpleModuleInstantiationFactory.supportedInterfaces;
    }

    public async get(name: string): Promise<IComponentFactory> {
        return this.registry.get(name);
    }

    public instantiateComponent(context: IComponentContext): void {
        this.get(this.defaultComponentName).then(
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
