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
    FluidReducerProps,
    FluidFunctionalComponentState,
    FluidReactComponent,
    useStateFluid,
    useReducerFluid,
    IFluidReducer,
    createFluidContext,
} from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const SchedulerName = pkg.name as string;

// ----- REACT STUFF -----

// ---- React Class Component ----

interface CounterState {
    value: number;
}

class CounterReactView extends FluidReactComponent<{}, CounterState> {
    render() {
        return (
            <div>
                <span className="scheduler-value-class" id={`scheduler-value-${Date.now().toString()}`}>
                    {`Regular Component: ${this.state.value}`}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}

// ---- React Functional Component w/ useState ----

interface CounterFunctionalState extends FluidFunctionalComponentState, CounterState {}

function CounterReactFunctional(props: FluidProps<{}, CounterFunctionalState>) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<{}, CounterFunctionalState>(props);

    return (
        <div>
            <span
                className="scheduler-value-class-functional"
                id={`scheduler-functional-value-${Date.now().toString()}`}
            >
                {`Functional Component: ${state.value}`}
            </span>
            <button onClick={() => { setState({ ...state, value: state.value + 1 }); }}>+</button>
        </div>
    );
}

// ---- React Functional Component w/ useReducer ----

interface IActionReducer extends IFluidReducer<CounterFunctionalState>{
    increment:  (oldState: CounterFunctionalState, args?: {step: number}) => CounterFunctionalState
}

const ActionReducer: IActionReducer = {
    increment:  (oldState: CounterFunctionalState, args?: {step: number}) => {
        return { value: args === undefined ? oldState.value + 1  : oldState.value + args.step };
    },
};

function CounterReactFunctionalReducer(props: FluidReducerProps<CounterFunctionalState, IActionReducer>) {
    // Declare a new state variable, which we'll call "count"
    const [state, dispatch] = useReducerFluid<CounterFunctionalState, IActionReducer>(props);

    return (
        <div>
            <span className="scheduler-value-class-reducer" id={`scheduler-reducer-value-${Date.now().toString()}`}>
                {`Functional Reducer Component: ${state.value}`}
            </span>
            <button onClick={() => { dispatch({ type: "increment" }); }}>+</button>
            <button onClick={() => { dispatch({ type: "increment", args: { step: 2 } }); }}>++</button>
        </div>
    );
}

function CounterReactFunctionalContext(props: FluidProps<{},CounterFunctionalState>) {
    const [FluidProvider, FluidConsumer, initialValue] = createFluidContext(props);
    return (
        <div>
            <FluidProvider value={initialValue}>
                <div>
                    <FluidConsumer>
                        {({ state, setState }) =>
                            <div>
                                <span
                                    className="scheduler-value-class-context"
                                    id={`scheduler-context-value-${Date.now().toString()}`}
                                >
                                    {`Context Component: ${state.value}`}
                                </span>
                                <button onClick={() => { setState({ ...state, value: state.value + 1 }); }}>+</button>
                            </div>}
                    </FluidConsumer>
                </div>
            </FluidProvider>
        </div>
    );
}

/**
 * Basic Scheduler example using new interfaces and stock component classes.
 */
export class Scheduler extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("counterClicks", 0);
        this.root.set("counterClicksFunctional", 0);
        this.root.set("counterClicksReducer", 0);
        this.root.set("counterClicksContext", 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Scheduler view
     */
    public render(div: HTMLElement) {
        const initialState: CounterState = { value: 0 };

        const rootToInitialState = new Map<string, keyof CounterState>();
        rootToInitialState.set("counterClicks", "value");
        const stateToRoot = new Map<keyof CounterState, string>();
        stateToRoot.set("value", "counterClicks");

        const rootToInitialStateFunctional = new Map<string, keyof CounterState>();
        rootToInitialStateFunctional.set("counterClicksFunctional", "value");
        const stateToRootFunctional = new Map<keyof CounterState, string>();
        stateToRootFunctional.set("value", "counterClicksFunctional");

        const rootToInitialStateReducer = new Map<string, keyof CounterState>();
        rootToInitialStateReducer.set("counterClicksReducer", "value");
        const stateToRootReducer = new Map<keyof CounterState, string>();
        stateToRootReducer.set("value", "counterClicksReducer");

        const rootToInitialStateContext = new Map<string, keyof CounterState>();
        rootToInitialStateContext.set("counterClicksContext", "value");
        const stateToRootContext = new Map<keyof CounterState, string>();
        stateToRootContext.set("value", "counterClicksContext");

        ReactDOM.render(
            <div>
                <CounterReactView
                    root={this.root}
                    reactComponentDefaultState={initialState}
                    rootToInitialState={rootToInitialState}
                    stateToRoot={stateToRoot}
                />
                <CounterReactFunctional
                    root={this.root}
                    reactComponentDefaultState={initialState}
                    rootToInitialState={rootToInitialStateFunctional}
                    stateToRoot={stateToRootFunctional}
                />
                <CounterReactFunctionalReducer
                    root={this.root}
                    initialState={initialState}
                    rootToInitialState={rootToInitialStateReducer}
                    stateToRoot={stateToRootReducer}
                    reducer={ActionReducer}
                />
                <CounterReactFunctionalContext
                    root={this.root}
                    reactComponentDefaultState={initialState}
                    rootToInitialState={rootToInitialStateContext}
                    stateToRoot={stateToRootContext}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const SchedulerInstantiationFactory = new PrimedComponentFactory(SchedulerName, Scheduler, [], {});
export const fluidExport = SchedulerInstantiationFactory;
