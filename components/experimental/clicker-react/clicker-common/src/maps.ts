/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidToViewMap,
    ViewToFluidMap,
    IFluidReactState,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "@fluidframework/react";
import { SharedCounter, ISharedCounter } from "@fluidframework/counter";

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
            viewConverter: (
                syncedState: Partial<ICounterFluidState>,
            ) => {
                return {
                    value: syncedState.counter?.value,
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
            fluidConverter: () => {
                return {};
            },
        },
    ],
]);

export const fluidToView: FluidToViewMap<ICounterFluidState,ICounterFluidState> = new Map([
    [
        "counter", {
            type: SharedCounter.name,
            viewKey: "counter",
            viewConverter: (syncedState) => syncedState,
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        },
    ],
]);
