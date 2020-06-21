/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidProps,
    useStateFluid,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import {
    primitiveFluidToView,
    primitiveViewToFluid,
} from "@fluid-example/clicker-common";
import { ICounterState } from "@fluid-example/clicker-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

// // ---- React Functional Component w/ useState ----

function CounterReactFunctional(props: IFluidProps<ICounterState,ICounterState>) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<ICounterState,ICounterState>(props, { value: 0 });

    return (
        <div>
            <span>
                {`Functional Component: ${state.value}`}
            </span>
            <button
                onClick={() => {
                    setState({ ...state, value: state.value + 1 });
                }}
            >
                +
            </button>
        </div>
    );
}

export class ClickerWithHooks extends SyncedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() {
        return this;
    }
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-functional",
            {
                syncedStateId: "counter-functional",
                fluidToView: primitiveFluidToView,
                viewToFluid: primitiveViewToFluid,
                defaultViewState: {},
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    syncedStateId={"counter-functional"}
                    syncedComponent={this}
                />
            </div>,
            div,
        );
        return div;
    }
}

export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    "clicker-functional",
    ClickerWithHooks,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
