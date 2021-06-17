/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedObjectSequence } from "@fluidframework/sequence";
import {
    IViewState,
    IFluidState,
    IFluidReducer,
    IFluidDataProps,
    FluidStateUpdateFunction,
} from "../..";

/**
 * The state interface exposed to the view for the synced array
 */
export interface ISyncedArrayViewState<T> extends IViewState {
    values: T[];
}

/**
 * The state interface for the Fluid data source that powers the synced array
 */
export interface ISyncedArrayFluidState<T> extends IFluidState {
    values: SharedObjectSequence<T>;
}

/**
 * The reducer interface for modifying the synced array
 * TODO: Add more functions that further expose the SharedObjectSequence interface for use
 */
export interface ISyncedArrayReducer<T> {
    add: (value: T) => void;
}

/**
 * The underlying reducer interface passed to the useReducerFluid hook to bind the view and Fluid
 * state definitions together
 */
export interface IFluidSyncedArrayReducer<
    SV extends IViewState,
    SF extends IFluidState
    > extends IFluidReducer<SV, SF, IFluidDataProps> {
    add: FluidStateUpdateFunction<SV, SF, IFluidDataProps>;
}
