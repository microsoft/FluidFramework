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
    ICounterState,
    ICounterFluidState,
    ICounterViewState,
} from "@fluid-example/clicker-definitions";

export const primitiveFluidToView: FluidToViewMap<ICounterState,ICounterState> = new Map([
    [
        "value", {
            type: "number",
            viewKey: "value",
        },
    ],
]);

export const primitiveViewToFluid: ViewToFluidMap<ICounterState,ICounterState> = new Map([
    [
        "value", {
            type: "number",
            fluidKey: "value",
        },
    ],
]);

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
                return fluidState;
            },
        },
    ],
]);

export const primitiveToDdsFluidToView: FluidToViewMap<ICounterViewState,ICounterFluidState> = new Map([
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

export const ddsToPrimitiveViewToFluid: ViewToFluidMap<ICounterViewState,ICounterFluidState> = new Map([
    [
        "value", {
            type: SharedCounter.name,
            fluidKey: "counter",
            fluidConverter: (viewState, fluidState) => {
                fluidState.counter?.increment(1);
                return fluidState.counter?.value;
            },
        },
    ],
]);
