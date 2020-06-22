/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IFluidDataProps, IFluidReducerProps, useReducerFluid } from "@fluidframework/react";
import { ICounterViewState, ICounterFluidState, IClickerReducer } from "@fluid-example/clicker-definitions";

import { PrimedContext } from "./context";
import { View } from "./view";

export function Container(
    props: IFluidReducerProps<
    ICounterViewState,
    ICounterFluidState,
    IClickerReducer,
    {},
    IFluidDataProps
    >,
) {
    const [ state, dispatch ] = useReducerFluid(props, { value: 0 });

    return (
        <PrimedContext.Provider value={ { state: state.viewState, dispatch } }>
            <View />
        </PrimedContext.Provider>
    );
}
