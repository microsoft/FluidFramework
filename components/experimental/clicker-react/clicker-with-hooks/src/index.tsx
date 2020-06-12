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
    IFluidFunctionalComponentViewState,
    useStateFluid,
    useReducerFluid,
    createContextFluid,
    FluidStateUpdateFunction,
    IFluidDataProps,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    FluidToViewMap,
    ViewToFluidMap,
    IFluidContextProps,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerWithHooksName = pkg.name as string;

// ----- REACT STUFF -----

interface CounterState {
    value: number;
}

// // ---- React Functional Component w/ useState ----

interface ICounterFunctionalViewState
    extends IFluidFunctionalComponentViewState,
    CounterState {}
interface ICounterFunctionalFluidState
    extends IFluidFunctionalComponentFluidState,
    CounterState {}

function CounterReactFunctional(
    props: IFluidProps<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    >,
) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    >(props, { value: 0 });

    return (
        <div>
            <span
                className="clickerWithHooks-value-class-functional"
                id={`clickerWithHooks-functional-value-${Date.now().toString()}`}
            >
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

function CounterReactFunctionalContext(
    props: IFluidContextProps<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState,
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
                fluidToView: this.functionalFluidToView,
                viewToFluid: this.functionalViewToFluid,
            },
        );

        this.syncedStateConfig.set(
            "counter-reducer",
            {
                syncedStateId: "counter-reducer",
                fluidToView: this.reducerFluidToView,
                viewToFluid: this.reducerViewToFluid,
            },
        );

        this.syncedStateConfig.set(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView: this.functionalFluidToView,
                viewToFluid: this.functionalViewToFluid,
            },
        );
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
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

    private readonly functionalFluidToView: FluidToViewMap<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    > = new Map([
        [
            "value", {
                type: "number",
                stateKey: "value",
                viewConverter: (state) => state,
            },
        ],
    ]);
    private readonly functionalViewToFluid: ViewToFluidMap<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    > = new Map([
        [
            "value", {
                type: "number",
                fluidKey: "value",
                fluidConverter: (state) => state,
            },
        ],
    ]);

    private readonly reducerFluidToView: FluidToViewMap<
    ICounterReducerViewState,
    ICounterReducerFluidState
    > = new Map([
        [
            "counter", {
                type: SharedCounter.name,
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
            },
        ],
    ]);

    private readonly reducerViewToFluid: ViewToFluidMap<
    ICounterReducerViewState,
    ICounterReducerFluidState
    > = new Map([
        [
            "value", {
                type: "number",
                fluidKey: "counter",
                fluidConverter: () => {
                    return {};
                },
            },
        ],
    ]);

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    ClickerWithHooksName,
    ClickerWithHooks,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
