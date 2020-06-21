/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IFluidDataProps, IFluidContextProps, createContextFluid } from "@fluidframework/react";
import { ICounterState } from "@fluid-example/clicker-definitions";

import { PrimedContext } from "./context";
import { View } from "./view";

export function Container(
    props: IFluidContextProps<
    ICounterState,
    ICounterState,
    IFluidDataProps
    >,
) {
    const { state, setState } = createContextFluid<ICounterState, ICounterState, IFluidDataProps>(props, { value: 0 });

    return (
        <PrimedContext.Provider value={ { state, setState } }>
            <View />
        </PrimedContext.Provider>
    );
}
