/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreContext, IFluidDataStoreChannel } from "./dataStoreContext";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDataStoreFactory>> { }
}

export const IFluidDataStoreFactory: keyof IProvideFluidDataStoreFactory = "IFluidDataStoreFactory";

export interface IProvideFluidDataStoreFactory {
    readonly IFluidDataStoreFactory: IFluidDataStoreFactory;
}

/**
 * IFluidDataStoreFactory create data stores.  It is associated with an identifier (its `type` member)
 * and usually provided to consumers using this mapping through a data store registry.
 */
export interface IFluidDataStoreFactory extends IProvideFluidDataStoreFactory {
    /**
     * String that uniquely identifies the type of data store created by this factory.
     */
    type: string;

    /**
     * Generates runtime for the data store from the data store context. Once created should be bound to the context.
     * @param context - Context for the data store.
     */
    instantiateDataStore(context: IFluidDataStoreContext): Promise<IFluidDataStoreChannel>;
}
