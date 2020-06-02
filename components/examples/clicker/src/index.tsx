/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    FluidReactComponent,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    FluidToViewMap,
} from "@fluidframework/aqueduct-react";
import { Counter, CounterValueType } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;
const CounterRootKey = "counter";

// ----- REACT STUFF -----

// ---- React Class Component ----

interface CounterState {
    counter: Counter;
}

interface CounterViewState extends IFluidFunctionalComponentViewState, CounterState {}

interface CounterFluidState extends IFluidFunctionalComponentFluidState, CounterState {}

class CounterReactView extends FluidReactComponent<CounterViewState, CounterFluidState> {
    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.counter.value}
                </span>
                <button onClick={() => { this.state.counter.increment(1); }}>+</button>
            </div>
        );
    }
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
        this.root.createValueType(CounterRootKey, CounterValueType.Name, 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        // Load initial state from root before entering React render lifecycle
        // View and Fluid states are identical since we are directly using the Counter
        // DDS in the view
        const initialState = { counter:  this.root.get(CounterRootKey) };

        // Mark the counter as the CounterValueType so that changes to it update the view
        const fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map();
        fluidToView.set(CounterRootKey, {
            fluidObjectType: CounterValueType.Name,
        });

        ReactDOM.render(
            <div>
                <CounterReactView
                    syncedStateId={"clicker"}
                    root={this.root}
                    initialViewState={initialState}
                    initialFluidState={initialState}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    fluidToView={fluidToView}
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
