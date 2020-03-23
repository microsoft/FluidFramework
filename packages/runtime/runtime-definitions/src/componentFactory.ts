/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext } from "./components";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentFactory>> {
    }
}

export interface IProvideComponentFactory {
    readonly IComponentFactory: IComponentFactory;
}

export interface IComponentCreator<T extends IComponent> {
    readonly IComponentCreator: IComponentCreator<T>;

    /**
     * The identifier of the component that is created
     */
    registryName: string

    /**
     * Create a component
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @returns A promise for a component that will have been initialized and attached
     * to the provided runtime's container
     */
    createComponent(context: IComponentContext): Promise<T>;
}

/**
 * The interface implemented by a component module.
 */
export interface IComponentFactory extends IProvideComponentFactory {
    /**
     * String that uniquely identifies the type of component created by this factory.
     */
    type?: string;

    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateComponent(context: IComponentContext): void;
}
