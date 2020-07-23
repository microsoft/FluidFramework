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

<<<<<<< HEAD
=======
/**
 * The state interface exposed to the view for the synced array
 */
>>>>>>> 53f0e4a434353df720e33ce5f452a6b9b0b1d2e1
export interface ISyncedArrayViewState<T> extends IFluidFunctionalComponentViewState {
    values: T[];
}

<<<<<<< HEAD
=======
/**
 * The state interface for the Fluid data source that powers the synced array
 */
>>>>>>> 53f0e4a434353df720e33ce5f452a6b9b0b1d2e1
export interface ISyncedArrayFluidState<T> extends IFluidFunctionalComponentFluidState {
    values: SharedObjectSequence<T>;
}

<<<<<<< HEAD
export interface IPureSyncedArrayReducer<T> {
    add: (value: T) => void;
}

export interface ISyncedArrayReducer<
=======
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
>>>>>>> 53f0e4a434353df720e33ce5f452a6b9b0b1d2e1
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends IFluidReducer<SV, SF, IFluidDataProps> {
    add: FluidStateUpdateFunction<SV, SF, IFluidDataProps>;
}
