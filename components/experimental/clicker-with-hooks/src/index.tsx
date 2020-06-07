/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
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
    FluidComponentMap,
} from "@fluidframework/aqueduct-react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";

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

function CounterReactFunctional(props: IFluidProps<ICounterFunctionalViewState, ICounterFunctionalFluidState>) {
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
    counter: SharedCounter;
}

interface IActionReducer extends IFluidReducer<ICounterReducerViewState, ICounterReducerFluidState, IFluidDataProps> {
    increment:  FluidStateUpdateFunction<ICounterReducerViewState,ICounterReducerFluidState,IFluidDataProps>;
}

const ActionReducer: IActionReducer = {
    increment: {
        function: (state, step: number) => {
            state.fluidState?.counter.increment(step);
            state.viewState.value = state.fluidState !== undefined ? state.fluidState.counter.value
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
    // The following is wrapped in some extra divs to show how the context is being passed from
    // a parent to a child layer without prop drilling being required.
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
    private _counter: SharedCounter | undefined;
    private readonly _fluidComponentMap: FluidComponentMap = new Map();

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set("counterClicksReducer", counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = this.root.get<IComponentHandle<SharedCounter>>("counterClicksReducer");
        this._counter = await counterHandle.get();
        this._fluidComponentMap.set(this._counter.handle.path, {
            component: this._counter,
            listenedEvents: ["incremented"],
        });
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
    public render(div: HTMLElement) {
        if (this._counter === undefined || this._fluidComponentMap === undefined) {
            throw Error("Component was not initialized correctly");
        }

        const functionalFluidToView:
        FluidToViewMap<ICounterFunctionalViewState, ICounterFunctionalFluidState> = new Map();
        functionalFluidToView.set("value", {
            viewConverter: (syncedState: Partial<ICounterFunctionalFluidState>) => {
                return {
                    value: syncedState.value,
                };
            },
        });
        const functionalViewToFluid:
        ViewToFluidMap<ICounterFunctionalViewState, ICounterFunctionalFluidState> = new Map();
        functionalViewToFluid.set("value", {
            fluidKey: "value",
            fluidConverter: (state: Partial<IFluidFunctionalComponentViewState>) => state,
        });

        const reducerFluidToViewMap: FluidToViewMap<ICounterReducerViewState, ICounterReducerFluidState> = new Map();
        reducerFluidToViewMap.set("counter", {
            stateKey: "value",
            viewConverter: (syncedState: Partial<ICounterReducerFluidState>) => {
                return {
                    value: syncedState.counter?.value,
                };
            },
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        });
        const reducerViewToFluidMap: ViewToFluidMap<ICounterReducerViewState, ICounterReducerFluidState> = new Map();
        reducerViewToFluidMap.set("value", {
            fluidKey: "counter",
            fluidConverter: () => {
                return {};
            },
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
                    fluidToView={functionalFluidToView}
                    viewToFluid={functionalViewToFluid}
                />
                <CounterReactFunctionalReducer
                    syncedStateId={"counter-reducer"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: this._fluidComponentMap,
                        runtime: this.runtime,
                    }}
                    initialViewState={{ value: this._counter.value }}
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
                    fluidToView={functionalFluidToView}
                    viewToFluid={functionalViewToFluid}
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
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
