/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    FluidReactComponent,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    FluidToViewMap,
    SyncedComponent,
    ViewToFluidMap,
} from "@fluidframework/react";
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
export class Clicker extends SyncedComponent implements IComponentHTMLView {
    constructor(props) {
        super(props);
        this.syncedStateConfig.set(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView: this.fluidToView,
                viewToFluid: this.viewToFluid,
            },
        );
    }
    public get IComponentHTMLView() { return this; }

    /**
     * Will return a new Clicker view
     */
    public render(element: HTMLElement) {
        ReactDOM.render(
            <CounterReactView
                syncedStateId={"clicker"}
                syncedComponent={this}
            />,
            element,
        );
        return element;
    }

    //  The fluidToView and viewToFluid maps establish the relationship between our synced Fluid state
    // and our React view state
    // Mark the counter value in the fluidToView map as a SharedCounter type and pass in its create function
    // so that it will be created on the first run and be available on our React state
    // We also mark the "incremented" event as we want to update the React state when the counter
    // is incremented to display the new value
    // We also establish the relationship that "counter" in our Fluid state maps to "counter" in our React state
    private readonly fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map([
        [
            "counter", {
                type: SharedCounter.name,
                viewKey: "counter",
                sharedObjectCreate: SharedCounter.create,
                listenedEvents: ["incremented"],
            },
        ],
    ]);

    private readonly viewToFluid: ViewToFluidMap<CounterViewState, CounterFluidState> = new Map([
        [
            "counter", {
                type: SharedCounter.name,
                fluidKey: "counter",
            },
        ],
    ]);
}

// ----- REACT STUFF -----

interface CounterState {
    counter?: SharedCounter;
}

type CounterViewState = IFluidFunctionalComponentViewState & CounterState;
type CounterFluidState = IFluidFunctionalComponentFluidState & CounterState;

class CounterReactView extends FluidReactComponent<CounterViewState, CounterFluidState> {
    constructor(props) {
        super(props);
        this.state = {};
    }

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
