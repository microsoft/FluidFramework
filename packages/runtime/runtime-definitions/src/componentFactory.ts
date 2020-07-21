/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentContext } from "./componentContext";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideFluidDataStoreFactory>> {}
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDataStoreFactory>> { }
}

export const IFluidDataStoreFactory: keyof IProvideFluidDataStoreFactory = "IFluidDataStoreFactory";

export interface IProvideFluidDataStoreFactory {
    readonly IFluidDataStoreFactory: IFluidDataStoreFactory;
}

/**
 * IFluidDataStoreFactory create components.  It is associated with an identifier (its `type` member)
 * and usually provided to consumers using this mapping through a component registry.
 */
export interface IFluidDataStoreFactory extends IProvideFluidDataStoreFactory {
    /**
     * String that uniquely identifies the type of component created by this factory.
     */
    type?: string;

    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Context for the component.
     */
    instantiateDataStore(context: IComponentContext): void;
}
