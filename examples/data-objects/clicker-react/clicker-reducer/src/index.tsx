/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidReducerProps,
    IViewState,
    useReducerFluid,
    FluidStateUpdateFunction,
    IFluidDataProps,
    IFluidState,
    IFluidReducer,
    SyncedDataObject,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";

// ---- Fluid Object w/ Functional React View using the useReducer hook ----

interface ICounterReducerViewState extends IViewState {
    value: number;
}

interface ICounterReducerFluidState
    extends IFluidState {
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
        // eslint-disable-next-line @typescript-eslint/ban-types
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
export class ClickerReducer extends SyncedDataObject {
    constructor(props) {
        super(props);

        this.setFluidConfig<ICounterReducerViewState, ICounterReducerFluidState>(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView: new Map([
                    [
                        "counter", {
                            type: SharedCounter.name,
                            viewKey: "value",
                            viewConverter: (viewState, fluidState) => {
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
}

// ----- FACTORY SETUP -----
export const ClickerReducerInstantiationFactory =
    new DataObjectFactory(
        "clicker-reducer",
        ClickerReducer,
        [SharedCounter.getFactory()],
        {},
    );

const clickerViewCallback = (clicker: ClickerReducer) =>
    <CounterReactFunctionalReducer
        syncedStateId={ "counter-reducer" }
        syncedDataObject={ clicker }
        reducer={ ActionReducer }
        selector={{}}
    />;

export const fluidExport =
    new ContainerViewRuntimeFactory<ClickerReducer>(ClickerReducerInstantiationFactory, clickerViewCallback);
