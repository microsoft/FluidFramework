/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IFluidProps, useStateFluid } from "@fluidframework/react";
import { ICounterState } from "@fluid-example/clicker-definitions";

export function CounterReactFunctional(props: IFluidProps<ICounterState,ICounterState>) {
    const [state, setState] = useStateFluid<ICounterState,ICounterState>(props, { value: 0 });
    return (
        <div>
            <span>
                {state.value}
            </span>
            <button
                onClick={() => setState({ value: state.value + 1 })}
            >
                +
            </button>
        </div>
    );
}
