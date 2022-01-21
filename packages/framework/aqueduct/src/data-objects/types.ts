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
    OptionalProviders?: FluidObject;
    /**
     * the initial state type that the produced data object may take during creation
     */
    InitialState?: any;
    /**
     * represents events that will be available in the EventForwarder
     */
    Events?: IEvent;
}

/**
 * @internal This utility type pulls a specific key's type off the T and returns that,
 *  or the default value if TKey is not specified by T
 */
export type DataObjectType<T extends DataObjectTypes, P extends keyof DataObjectTypes> =
    T[P] extends Required<DataObjectTypes>[P] ? T[P] : Required<DataObjectTypes>[P];

export interface IDataObjectProps<I extends DataObjectTypes = DataObjectTypes> {
    readonly runtime: IFluidDataStoreRuntime;
    readonly context: IFluidDataStoreContext;
    readonly providers:
        // eslint-disable-next-line @typescript-eslint/ban-types
        AsyncFluidObjectProvider<FluidObjectKey<DataObjectType<I, "OptionalProviders">>, FluidObjectKey<object>>;
    readonly initProps?: DataObjectType<I, "InitialState">;
}
