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
    useStateFluid,
    useReducerFluid,
    createContextFluid,
    FluidStateUpdateFunction,
    IFluidDataProps,
} from "@microsoft/fluid-aqueduct-react";
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

// ---- React Functional Component w/ useState ----

interface CounterFunctionalState extends FluidFunctionalComponentState, CounterState {}

function CounterReactFunctional(props: FluidProps<{}, CounterFunctionalState>) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<{}, CounterFunctionalState>(props);

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

interface IActionReducer {
    increment:  FluidStateUpdateFunction<CounterFunctionalState, IFluidDataProps>,
}

const ActionReducer: IActionReducer = {
    increment: {
        function: (state: CounterFunctionalState, dataProps, step: number) => {
            state.value =  step === undefined ? state.value + 1  : state.value + step;
            return { state };
        },
    },
};

function CounterReactFunctionalReducer(
    props: FluidReducerProps<CounterFunctionalState, IActionReducer, {}, IFluidDataProps>,
) {
    const [state, dispatch] = useReducerFluid<CounterFunctionalState, IActionReducer, {}, IFluidDataProps>(props);
    return (
        <div>
            <span
                className="clickerWithHooks-value-class-reducer"
                id={`clickerWithHooks-reducer-value-${Date.now().toString()}`}
            >
                {`Functional Reducer Component: ${state.value}`}
            </span>
            <button onClick={() => { dispatch("increment"); }}>+</button>
            <button onClick={() => { dispatch("increment", 2); }}>++</button>
        </div>
    );
}

function CounterReactFunctionalContext(props: FluidProps<{},CounterFunctionalState>) {
    const reactContext = {};
    const { Provider, Consumer, state, setState } = createContextFluid<{}, CounterFunctionalState, {}>(
        {
            reactContext,
            ...props,
        },
    );
    return (
        <div>
            <Provider value={{ state, setState, reactContext }}>
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
        this.root.set("counterClicksReducer", 0);
        this.root.set("counterClicksContext", 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
    public render(div: HTMLElement) {
        const stateToRootFunctional = new Map<keyof CounterState, string>();
        stateToRootFunctional.set("value", "counterClicksFunctional");

        const stateToRootReducer = new Map<keyof CounterState, string>();
        stateToRootReducer.set("value", "counterClicksReducer");

        const stateToRootContext = new Map<keyof CounterState, string>();
        stateToRootContext.set("value", "counterClicksContext");

        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    root={this.root}
                    fluidComponentMap={new Map()}
                    initialState={{ value: this.root.get("counterClicksFunctional") }}
                    stateToRoot={stateToRootFunctional}
                />
                <CounterReactFunctionalReducer
                    root={this.root}
                    fluidComponentMap={new Map()}
                    runtime={this.runtime}
                    initialState={{ value: this.root.get("counterClicksReducer") }}
                    stateToRoot={stateToRootReducer}
                    reducer={ActionReducer}
                    selector={{}}
                />
                <CounterReactFunctionalContext
                    root={this.root}
                    fluidComponentMap={new Map()}
                    initialState={{ value: this.root.get("counterClicksContext") }}
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
export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    ClickerWithHooksName,
    ClickerWithHooks,
    [],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
