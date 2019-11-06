/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentContext } from "./components";

declare module "@microsoft/fluid-component-core-interfaces" {
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
     * This is kinda hacky and basically provides a default registry name that we are allowed to override
     * It's optional because I don't want to update every IComponentFactory atm
     */
    registryName?: string;
    
    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateComponent(context: IComponentContext): void;
}
