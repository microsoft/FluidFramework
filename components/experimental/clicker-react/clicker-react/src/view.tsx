/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { PureFluidReactComponent } from "@fluidframework/react";
import { ICounterFluidState } from "@fluid-example/clicker-definitions";

export class CounterReactView extends PureFluidReactComponent<ICounterFluidState> {
    render() {
        return (
            <div>
                <span className="value">
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}
