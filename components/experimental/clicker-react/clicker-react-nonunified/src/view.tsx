/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { FluidReactComponent } from "@fluidframework/react";
import { ICounterFluidState, ICounterViewState } from "@fluid-example/clicker-definitions";

export class CounterReactView extends FluidReactComponent<ICounterViewState, ICounterFluidState> {
    render() {
        return (
            <div>
                <span>
                    {this.state.value}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}
