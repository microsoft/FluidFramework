/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidReducerProps,
    useReducerFluid,
    IFluidDataProps,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import {
    ActionReducer,
    ddsFluidToView,
    ddsViewToFluid,
} from "@fluid-example/clicker-common";
import { IActionReducer, ICounterViewState, ICounterFluidState } from "@fluid-example/clicker-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

// ---- React Functional Component w/ useReducer ----

function CounterReactFunctionalReducer(
    props: IFluidReducerProps<
    ICounterViewState,
    ICounterFluidState,
    IActionReducer,
    {},
    IFluidDataProps
    >,
) {
    const [state, dispatch] = useReducerFluid(props, { value: 0 });

    return (
        <div>
            <span>
                {`Functional Reducer Component: ${state.viewState.value}`}
            </span>
            <button
                onClick={() => {
                    dispatch.increment.function(state, 1);
                }}
            >
                +
            </button>
            <button
                onClick={() => {
                    dispatch.increment.function(state, 2);
                }}
            >
                ++
            </button>
        </div>
    );
}

/**
 * Basic ClickerWithHooks example using new interfaces and stock component classes.
 */
export class ClickerWithHooks extends SyncedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() {
        return this;
    }
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView: ddsFluidToView,
                viewToFluid: ddsViewToFluid,
                defaultViewState: { value: 0 },
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    syncedComponent={this}
                    dataProps={{
                        fluidComponentMap: this.fluidComponentMap,
                        runtime: this.runtime,
                    }}
                    reducer={ActionReducer}
                    selector={{}}
                />
            </div>,
            div,
        );
        return div;
    }
}

export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    "clicker-reducer",
    ClickerWithHooks,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
