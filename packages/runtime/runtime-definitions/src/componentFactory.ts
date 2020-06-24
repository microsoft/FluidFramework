/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable } from "@fluidframework/component-core-interfaces";
import { IComponentContext } from "./componentContext";

declare module "@fluidframework/component-core-interfaces" {
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
export interface IComponentFactory extends IProvideComponentFactory, Partial<IProvideCreateComponentWithAny> {
    /**
     * String that uniquely identifies the type of component created by this factory.
     */
    type?: string;

    /**
     * Create a component described by the factory
     * @param context - The component context being used to create the component
     * (the created component will have its own new context created as well)
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    createComponent?(context: IComponentContext): Promise<IComponent & IComponentLoadable>;

    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateComponent(context: IComponentContext): void;
}

export const ICreateComponentWithAny: keyof IProvideCreateComponentWithAny = "ICreateComponentWithAny";

export interface IProvideCreateComponentWithAny {
    readonly ICreateComponentWithAny: ICreateComponentWithAny;
}

/**
 * Interface that exposes a createComponent signature that allows any initial state for cases that need it,
 * such as when loading and creating arbitrary components where the specific component factory is not known
 * beforehand.  In all other cases, consumers should prefer using the initial state generics in the Component
 * and ComponentFactory implementations provided in Aqueduct istead.
 */
export interface ICreateComponentWithAny extends IProvideCreateComponentWithAny {
    createComponent(context: IComponentContext, initialState?: any): Promise<IComponent & IComponentLoadable>;
}
