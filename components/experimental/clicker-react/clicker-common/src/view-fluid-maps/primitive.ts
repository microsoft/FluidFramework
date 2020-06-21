/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FluidToViewMap,
    ViewToFluidMap,
} from "@fluidframework/react";
import { ICounterState } from "@fluid-example/clicker-definitions";

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
