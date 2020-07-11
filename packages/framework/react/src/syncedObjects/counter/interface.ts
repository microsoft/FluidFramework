/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedCounter } from "@fluidframework/counter";
import {
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidDataProps,
    FluidStateUpdateFunction,
} from "../..";

export interface ISyncedCounterViewState extends IFluidFunctionalComponentViewState {
    value: number;
}

export interface ISyncedCounterFluidState extends IFluidFunctionalComponentFluidState {
    counter: ISharedCounter;
}

export interface IPureSyncedCounterReducer {
    increment: (step: number) => void;
}

export interface ISyncedCounterReducer<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> extends IFluidReducer<SV, SF, IFluidDataProps> {
    increment: FluidStateUpdateFunction<SV, SF, IFluidDataProps>;
}
