/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnifiedFluidReactComponent, IFluidReactState } from "@fluidframework/react";
import * as React from "react";

interface ICounterState extends IFluidReactState {
    value: number;
}

export class CounterReactView extends UnifiedFluidReactComponent<ICounterState> {
    render() {
        return (
            <div>
                <span className="value">
                    {this.state.value}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}
