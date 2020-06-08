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
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(element: HTMLElement) {
        // Mark the counter value in the state as a SharedCounter type and pass in its create function
        // so that it will be created on the first run and be available on our React state
        // We also mark the "incremented" event as we want to update the React state when the counter
        // is incremented to display the new value
        const fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map();
        fluidToView.set("counter", {
            sharedObjectCreate: SharedCounter.create,
            listenedEvents: ["incremented"],
        });

        ReactDOM.render(
            <CounterReactView
                syncedStateId={"clicker"}
                root={this.root}
                initialViewState={{}}
                dataProps={{
                    fluidComponentMap: new Map(),
                    runtime: this.runtime,
                }}
                fluidToView={fluidToView}
            />,
            element,
        );
        return element;
    }

    // #endregion IComponentHTMLView
}

// ----- REACT STUFF -----

interface CounterState {
    counter?: SharedCounter;
}

interface CounterViewState extends IFluidFunctionalComponentViewState, CounterState { }

interface CounterFluidState extends IFluidFunctionalComponentFluidState, CounterState { }

class CounterReactView extends FluidReactComponent<CounterViewState, CounterFluidState> {
    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}

// ----- FACTORY SETUP -----
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
