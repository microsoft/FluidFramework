/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluidProps, useStateFluid, FluidFunctionalComponentState, FluidReactComponent } from "./fluidReactComponent";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

// ----- REACT STUFF -----

interface CounterState {
    value: number;
}

interface CounterFunctionalState extends FluidFunctionalComponentState, CounterState {}

class CounterReactView extends FluidReactComponent<{}, CounterState> {
    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.value}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}

function CounterReactFunctional(props: FluidProps<{}, CounterFunctionalState>) {
    // Declare a new state variable, which we'll call "count"
    const [state, setState] = useStateFluid<{}, CounterFunctionalState>(props);

    return (
        <div>
            <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                {state.value}
            </span>
            <button onClick={() => { setState({ ...state, value: state.value + 1 }); }}>+</button>
        </div>
    );
}

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("counterClicks", 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        const rootToInitialState = new Map<string, keyof CounterState>();
        rootToInitialState.set("counterClicks", "value");
        const stateToRoot = new Map<keyof CounterState, string>();
        stateToRoot.set("value", "counterClicks");
        ReactDOM.render(
            <div>
                <CounterReactView
                    root={this.root}
                    reactComponentDefaultState={{ value: 0 }}
                    rootToInitialState={rootToInitialState}
                    stateToRoot={stateToRoot}
                />
                <CounterReactFunctional
                    root={this.root}
                    reactComponentDefaultState={{ value: 0, isInitialized: false }}
                    rootToInitialState={rootToInitialState}
                    stateToRoot={stateToRoot}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerInstantiationFactory = new PrimedComponentFactory(ClickerName, Clicker, [], {});
export const fluidExport = ClickerInstantiationFactory;
