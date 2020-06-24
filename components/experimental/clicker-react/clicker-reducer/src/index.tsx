/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
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
    FluidToViewMap,
    ViewToFluidMap,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
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

const ActionReducer: IActionReducer = {
    increment: {
        function: (state, step: number) => {
            state.fluidState?.counter.increment(step);
            state.viewState.value =
                state.fluidState !== undefined
                    ? state.fluidState.counter.value
                    : state.viewState.value;
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
export class ClickerReducer extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() {
        return this;
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
    public render(div: HTMLElement) {
        const reducerFluidToViewMap: FluidToViewMap<
        ICounterReducerViewState,
        ICounterReducerFluidState
        > = new Map();
        reducerFluidToViewMap.set("counter", {
            stateKey: "value",
            viewConverter: (
                syncedState: Partial<ICounterReducerFluidState>,
            ) => {
                return {
                    value: syncedState.counter?.value,
                };
            },
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        });
        const reducerViewToFluidMap: ViewToFluidMap<
        ICounterReducerViewState,
        ICounterReducerFluidState
        > = new Map();
        reducerViewToFluidMap.set("value", {
            fluidKey: "counter",
            fluidConverter: () => {
                return {};
            },
        });

        ReactDOM.render(
            <div>
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    fluidToView={reducerFluidToViewMap}
                    viewToFluid={reducerViewToFluidMap}
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
