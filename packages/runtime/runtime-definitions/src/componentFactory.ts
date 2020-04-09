/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext } from "./components";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentFactory>> {
    }
}

export const IComponentFactory: keyof IProvideComponentFactory = "IComponentFactory";

export interface IProvideComponentFactory {
    readonly IComponentFactory: IComponentFactory;
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
     * Create a component described by the factory
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @param initialState - Optional initial state to provide the component during initialization.
     * The component decides how to use this state.
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    createComponent?(context: IComponentContext, initialState?: any): Promise<IComponent & IComponentLoadable>;

    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateComponent(context: IComponentContext, initialState?: any): void;
}
