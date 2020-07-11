/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedObjectSequence } from "@fluidframework/sequence";
import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidDataProps,
    FluidStateUpdateFunction,
} from "../..";

export interface ISyncedArrayViewState<T> extends IFluidFunctionalComponentViewState {
    values: T[];
}

export interface ISyncedArrayFluidState<T> extends IFluidFunctionalComponentFluidState {
    values: SharedObjectSequence<T>;
}

export interface IPureSyncedArrayReducer<T> {
    add: (value: T) => void;
}

export interface ISyncedArrayReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends IFluidReducer<SV, SF, IFluidDataProps> {
    add: FluidStateUpdateFunction<SV, SF, IFluidDataProps>;
}
