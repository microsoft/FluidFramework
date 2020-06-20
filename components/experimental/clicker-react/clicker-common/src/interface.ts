/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidReactState,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState
} from "@fluidframework/react";

export interface ICounterState extends IFluidReactState {
    value: number;
}
