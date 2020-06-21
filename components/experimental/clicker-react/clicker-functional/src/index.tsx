/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidProps,
    IFluidReducerProps,
    useStateFluid,
    useReducerFluid,
    createContextFluid,
    IFluidDataProps,
    IFluidContextProps,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import {
    ICounterState,
    ICounterViewState,
    ICounterFluidState,
    IActionReducer,
    ActionReducer,
    primitiveFluidToView,
    primitiveViewToFluid,
    ddsFluidToView,
    ddsViewToFluid,
} from "@fluid-example/clicker-common";

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

function CounterReactFunctionalContext(
    props: IFluidContextProps<
    ICounterState,
    ICounterState,
    IFluidDataProps
    >,
) {
    const { Provider, Consumer, state, setState } = createContextFluid(props, { value: 0 });
    // The following is wrapped in some extra divs to show how the context is being passed from
    // a parent to a child layer without prop drilling being required.
    return (
        <div>
            <Provider
                value={{ state, setState, reactContext: props.reactContext }}
            >
                <div>
                    <Consumer>
                        {(context) => (
                            <div>
                                <span
                                    className="clickerWithHooks-value-class-context"
                                    id={`clickerWithHooks-context-value-${Date.now().toString()}`}
                                >
                                    {`Context Component: ${context.state.value}`}
                                </span>
                                <button
                                    onClick={() => {
                                        context.setState({
                                            ...state,
                                            value: context.state.value + 1,
                                        });
                                    }}
                                >
                                    {"+"}
                                </button>
                            </div>
                        )}
                    </Consumer>
                </div>
            </Provider>
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
            "counter-functional",
            {
                syncedStateId: "counter-functional",
                fluidToView: primitiveFluidToView,
                viewToFluid: primitiveViewToFluid,
                defaultViewState: {},
            },
        );

        this.syncedStateConfig.set(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView: ddsFluidToView,
                viewToFluid: ddsViewToFluid,
                defaultViewState: { value: 0 },
            },
        );

        this.syncedStateConfig.set(
            "counter-context",
            {
                syncedStateId: "counter-context",
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
                <CounterReactFunctionalContext
                    syncedStateId={"counter-context"}
                    syncedComponent={this}
                    reactContext={{}}
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
