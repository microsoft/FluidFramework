/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidReactState,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidDataProps,
    FluidStateUpdateFunction,
} from "@fluidframework/react";
import { ISharedCounter } from "@fluidframework/counter";

export interface ICounterState extends IFluidReactState {
    value: number;
}

export interface ICounterViewState extends IFluidFunctionalComponentViewState {
    value: number;
}

export interface ICounterFluidState
    extends IFluidFunctionalComponentFluidState {
    counter?: ISharedCounter;
}

export interface IActionReducer
    extends IFluidReducer<
    ICounterViewState,
    ICounterFluidState,
    IFluidDataProps
    > {
    increment: FluidStateUpdateFunction<
    ICounterViewState,
    ICounterFluidState,
    IFluidDataProps
    >;
}
