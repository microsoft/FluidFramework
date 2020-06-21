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

export const ddsToPrimitiveFluidToView: FluidToViewMap<ICounterViewState,ICounterFluidState> = new Map([
    [
        "counter", {
            type: SharedCounter.name,
            viewKey: "value",
            viewConverter: (syncedState) => syncedState,
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        },
    ],
]);

export const primitiveToDdsViewToFluid: ViewToFluidMap<ICounterViewState,ICounterFluidState> = new Map([
    [
        "value", {
            type: SharedCounter.name,
            fluidKey: "counter",
            fluidConverter: (viewState, fluidState) => {
                if (fluidState.counter !== undefined) {
                    while (viewState.value > fluidState.counter?.value) {
                        fluidState.counter?.increment(1);
                        viewState.value = fluidState.counter.value;
                    }
                }
                return fluidState.counter?.value;
            },
        },
    ],
]);
