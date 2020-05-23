/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    FluidProps,
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
} from "@microsoft/fluid-aqueduct-react";
import { Counter, CounterValueType } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
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

interface ICounterFunctionalViewState extends IFluidFunctionalComponentViewState, CounterState {}
interface ICounterFunctionalFluidState extends IFluidFunctionalComponentFluidState, CounterState {}

function CounterReactFunctional(props: FluidProps<ICounterFunctionalViewState, ICounterFunctionalFluidState>) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<ICounterFunctionalViewState, ICounterFunctionalFluidState>(props);

    return (
        <div>
            <span
                className="clickerWithHooks-value-class-functional"
                id={`clickerWithHooks-functional-value-${Date.now().toString()}`}
            >
                {`Functional Component: ${state.value}`}
            </span>
            <button onClick={() => { setState({ ...state, value: state.value + 1 }); }}>+</button>
        </div>
    );
}

// ---- React Functional Component w/ useReducer ----

interface ICounterReducerViewState extends IFluidFunctionalComponentViewState {
    value: number;
}

interface ICounterReducerFluidState extends IFluidFunctionalComponentFluidState {
    counter: Counter;
}

interface IActionReducer extends IFluidReducer<ICounterReducerViewState, ICounterReducerFluidState, IFluidDataProps> {
    increment:  FluidStateUpdateFunction<ICounterReducerViewState,ICounterReducerFluidState,IFluidDataProps>;
}

const ActionReducer: IActionReducer = {
    increment: {
        function: (state, step: number) => {
            state.fluidState.counter.increment(step);
            state.viewState.value =  step === undefined
                ? state.viewState.value + 1
                : state.viewState.value + step;
            return { state: state.viewState };
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
    >) {
    const [state, dispatch] = useReducerFluid(props);

    return (
        <div>
            <span
                className="clickerWithHooks-value-class-reducer"
                id={`clickerWithHooks-reducer-value-${Date.now().toString()}`}
            >
                {`Functional Reducer Component: ${state.viewState.value}`}
            </span>
            <button onClick={() => { dispatch.increment.function(state, 1);}}>+</button>
            <button onClick={() => { dispatch.increment.function(state, 2);}}>++</button>
        </div>
    );
}

function CounterReactFunctionalContext(props: IFluidContextProps<
ICounterFunctionalViewState,
ICounterFunctionalFluidState,
IFluidDataProps
>) {
    const { Provider, Consumer, state, setState } = createContextFluid(props);
    return (
        <div>
            <Provider value={{ state, setState, reactContext: props.reactContext }}>
                <div>
                    <Consumer>
                        {(context) =>
                            <div>
                                <span
                                    className="clickerWithHooks-value-class-context"
                                    id={`clickerWithHooks-context-value-${Date.now().toString()}`}
                                >
                                    {`Context Component: ${context.state.value}`}
                                </span>
                                <button
                                    onClick={() => { context.setState({ ...state, value: context.state.value + 1 }); }}
                                >{"+"}
                                </button>
                            </div>}
                    </Consumer>
                </div>
            </Provider>
        </div>
    );
}

/**
 * Basic ClickerWithHooks example using new interfaces and stock component classes.
 */
export class ClickerWithHooks extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("counterClicksFunctional", 0);
        this.root.createValueType("counterClicksReducer", CounterValueType.Name, 0);
        this.root.set("counterClicksContext", 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
    public render(div: HTMLElement) {
        // const stateToRootContext = new Map<keyof CounterState, string>();
        // stateToRootContext.set("value", "counterClicksContext");

        const reducerFluidToViewMap: FluidToViewMap<ICounterReducerViewState, ICounterReducerFluidState> = new Map();
        reducerFluidToViewMap.set("counter", {
            stateKey: "value",
            viewConverter: (syncedState: Partial<ICounterReducerFluidState>) => {
                return {
                    value: syncedState.counter?.value,
                };
            },
            rootKey: "counterClicksReducer",
            fluidObjectType: CounterValueType.Name,
        });
        const reducerViewToFluidMap: ViewToFluidMap<ICounterReducerViewState, ICounterReducerFluidState> = new Map();
        reducerViewToFluidMap.set("value", {
            rootKey: "counter",
        });
        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    syncedStateId={"counter-functional"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    initialViewState={{ value: 0 }}
                    initialFluidState={{ value: this.root.get("counterClicksFunctional") }}
                />
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    initialViewState={{ value: 0 }}
                    initialFluidState={{ counter: this.root.get("counterClicksReducer") }}
                    fluidToView={reducerFluidToViewMap}
                    viewToFluid={reducerViewToFluidMap}
                    reducer={ActionReducer}
                    selector={{}}
                />
                <CounterReactFunctionalContext
                    syncedStateId={"counter-context"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    reactContext={{}}
                    initialViewState={{ value: 0 }}
                    initialFluidState={{ value: this.root.get("counterClicksContext") }}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    ClickerWithHooksName,
    ClickerWithHooks,
    [],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
