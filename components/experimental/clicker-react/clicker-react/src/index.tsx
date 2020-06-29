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
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends SyncedComponent {
    constructor(props) {
        super(props);
        // Mark the counter value in the state as a SharedCounter type and pass in its create function
        // so that it will be created on the first run and be available on our React state
        // We also mark the "incremented" event as we want to update the React state when the counter
        // is incremented to display the new value
        this.setConfig<ICounterState>(
            "clicker",
            {
                syncedStateId: "clicker",
                fluidToView:  new Map([
                    [
                        "counter", {
                            type: SharedCounter.name,
                            viewKey: "counter",
                            sharedObjectCreate: SharedCounter.create,
                            listenedEvents: ["incremented"],
                        },
                    ],
                ]),
                defaultViewState: {},
            },
        );
    }
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
}

// ----- REACT STUFF -----

interface ICounterState {
    counter?: SharedCounter;
}

type CounterViewState = IFluidFunctionalComponentViewState & ICounterState;
type CounterFluidState = IFluidFunctionalComponentFluidState & ICounterState;

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
