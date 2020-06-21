/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidReducer, IFluidDataProps, FluidStateUpdateFunction } from "@fluidframework/react";
import { ICounterViewState, ICounterFluidState } from ".";

export const ActionReducer: IActionReducer = {
    increment: {
        function: (state, step: number) => {
            const counter = state.fluidState?.counter;
            if (counter === undefined) {
                throw Error("Failed to increment, fluid state was not initalized");
            }
            counter.increment(step);
            state.viewState.value = counter.value;
            return { state };
        },
    },
};

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
