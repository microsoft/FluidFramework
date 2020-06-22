/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IClickerReducer, ICounterViewState, ICounterFluidState } from "@fluid-example/clicker-definitions";
import { IFluidReducerProps, IFluidDataProps, useReducerFluid } from "@fluidframework/react";

export function CounterReactFunctionalReducer(
    props: IFluidReducerProps<
    ICounterViewState,
    ICounterFluidState,
    IClickerReducer,
    {},
    IFluidDataProps
    >,
) {
    const [state, dispatch] = useReducerFluid(props, { value: 0 });

    return (
        <div>
            <span className="value">
                {state.viewState.value}
            </span>
            <button onClick={() => dispatch.increment.function()}>
                +
            </button>
            <button onClick={() => dispatch.incrementTwo.function()}>
                ++
            </button>
        </div>
    );
}
