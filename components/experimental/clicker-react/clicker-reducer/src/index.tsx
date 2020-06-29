/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidReducerProps,
    IFluidFunctionalComponentViewState,
    useReducerFluid,
    FluidStateUpdateFunction,
    IFluidDataProps,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerReducerName = pkg.name as string;

// ---- React Functional Component w/ useReducer ----

interface ICounterReducerViewState extends IFluidFunctionalComponentViewState {
    value: number;
}

interface ICounterReducerFluidState
    extends IFluidFunctionalComponentFluidState {
    counter: SharedCounter;
}

interface IActionReducer
    extends IFluidReducer<
    ICounterReducerViewState,
    ICounterReducerFluidState,
    IFluidDataProps
    > {
    increment: FluidStateUpdateFunction<
    ICounterReducerViewState,
    ICounterReducerFluidState,
    IFluidDataProps
    >;
}

export const ActionReducer: IActionReducer = {
    increment: {
        function: (state, step: number) => {
            if (state === undefined || state.fluidState?.counter === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            const counter = state.fluidState?.counter;
            counter.increment(step);
            state.viewState.value = counter.value;
            return { state };
        },
    },
};

function CounterReactFunctionalReducer(
    props: IFluidReducerProps<
    ICounterReducerViewState,
    ICounterReducerFluidState,
    IActionReducer,
    {},
    IFluidDataProps
    >,
) {
    const [state, dispatch] = useReducerFluid(props, { value: 0 });

    return (
        <div>
            <span
                className="clickerWithHooks-value-class-reducer"
                id={`clickerWithHooks-reducer-value-${Date.now().toString()}`}
            >
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
 * ClickerReducer example using the useReducerFluid hook
 */
export class ClickerReducer extends SyncedComponent {
    constructor(props) {
        super(props);

        this.setFluidConfig<ICounterReducerViewState,ICounterReducerFluidState>(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView:  new Map([
                    [
                        "counter", {
                            type: SharedCounter.name,
                            viewKey: "value",
                            viewConverter: (viewState, fluidState, fluidComponentMap) => {
                                return {
                                    value: fluidState.counter?.value,
                                };
                            },
                            sharedObjectCreate: SharedCounter.create,
                            listenedEvents: ["incremented"],
                        },
                    ],
                ]),
                viewToFluid: new Map([
                    [
                        "value", {
                            type: "number",
                            fluidKey: "counter",
                            fluidConverter: (viewState, fluidState) => {
                                return fluidState.counter?.value;
                            },
                        },
                    ],
                ]),
                defaultViewState: { value: 0 },
            },
        );
    }
    /**
     * Will return a new ClickerReducer view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    syncedComponent={this}
                    reducer={ActionReducer}
                    selector={{}}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerReducerInstantiationFactory = new PrimedComponentFactory(
    ClickerReducerName,
    ClickerReducer,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerReducerInstantiationFactory;
