/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentContext } from "./components";

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentFactory>> {
    }
}

export interface IProvideComponentFactory {
    readonly IComponentFactory: IComponentFactory;
}

/**
 * The interface implemented by a component module.
 */
export interface IComponentFactory extends IProvideComponentFactory {
    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateComponent(context: IComponentContext): void;
}

export type ComponentFactoryTypes = IComponentFactory | { instantiateComponent(context: IComponentContext): void; };

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistry>> {}
}

export type ComponentRegistryTypes =
    IComponentRegistry | { get(name: string): Promise<ComponentFactoryTypes> | undefined };

export interface IProvideComponentRegistry {
    IComponentRegistry: IComponentRegistry;
}

export interface IComponentRegistry extends IProvideComponentRegistry {
    get(name: string): Promise<ComponentFactoryTypes> | undefined;
}
