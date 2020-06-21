/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidToViewMap,
    ViewToFluidMap,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import {
    ICounterFluidState,
    ICounterViewState,
} from "@fluid-example/clicker-definitions";

export const ddsFluidToView: FluidToViewMap<ICounterViewState,ICounterFluidState> = new Map([
    [
        "counter", {
            type: SharedCounter.name,
            viewKey: "value",
            viewConverter: (viewState, fluidState, fluidComponentMap) => {
                return {
                    value: fluidState.counter?.value,
                };
            },
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        },
    ],
]);

export const ddsViewToFluid: ViewToFluidMap<ICounterViewState,ICounterFluidState> = new Map([
    [
        "value", {
            type: "number",
            fluidKey: "counter",
            fluidConverter: (viewState, fluidState) => {
                return fluidState.counter?.value;
            },
        },
    ],
]);
