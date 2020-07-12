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

/**
 * The state interface exposed to the view for the synced array
 */
export interface ISyncedArrayViewState<T> extends IFluidFunctionalComponentViewState {
    values: T[];
}

/**
 * The state interface for the Fluid data source that powers the synced array
 */
export interface ISyncedArrayFluidState<T> extends IFluidFunctionalComponentFluidState {
    values: SharedObjectSequence<T>;
}

/**
 * The reducer interface for modifying the synced array
 * TODO: Add more functions that explore more of the SharedObjectSequence interface
 */
export interface IPureSyncedArrayReducer<T> {
    add: (value: T) => void;
}

/**
 * The underlying reducer interface passed to the useReducerFluid hook to bind the view and Fluid
 * state definitions together
 */
export interface ISyncedArrayReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends IFluidReducer<SV, SF, IFluidDataProps> {
    add: FluidStateUpdateFunction<SV, SF, IFluidDataProps>;
}
