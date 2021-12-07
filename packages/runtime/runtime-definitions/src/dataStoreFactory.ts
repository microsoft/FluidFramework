/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreContext, IFluidDataStoreChannel } from "./dataStoreContext";

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject  {
        /**
         * @deprecated - use `FluidObject<IFluidDataStoreFactory>` instead
         */
        readonly IFluidDataStoreFactory?: IFluidDataStoreFactory;
    }
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
     * @param existing - If instantiating from an existing file.
     */
    instantiateDataStore(context: IFluidDataStoreContext, existing: boolean): Promise<IFluidDataStoreChannel>;
}
