/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidObject,
} from "@fluidframework/core-interfaces";
import { AsyncFluidObjectProvider, FluidObjectKey } from "@fluidframework/synthesize";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IEvent } from "@fluidframework/common-definitions";

/**
 * This type is used as the base generic input to DataObject and PureDataObject.
 */
export interface DataObjectTypes {
    /**
     * represents a type that will define optional providers that will be injected
     */
    OptionalProviders?: FluidObject,
    /**
     * the initial state type that the produced data object may take during creation
     */
    State?: any,
    /**
     * represents events that will be available in the EventForwarder
     */
    Events?: IEvent
}

export type Default<T extends DataObjectTypes> = {
    [P in keyof Required<DataObjectTypes>]:
        T[P] extends Required<DataObjectTypes>[P]
            ? T[P]
            : Required<DataObjectTypes>[P]
};

export interface IDataObjectProps<I extends DataObjectTypes = DataObjectTypes> {
    readonly runtime: IFluidDataStoreRuntime;
    readonly context: IFluidDataStoreContext;
    readonly providers:
        // eslint-disable-next-line @typescript-eslint/ban-types
        AsyncFluidObjectProvider<FluidObjectKey<Default<I>["OptionalProviders"]>, FluidObjectKey<object>>;
    readonly initProps?: Default<I>["State"];
}
