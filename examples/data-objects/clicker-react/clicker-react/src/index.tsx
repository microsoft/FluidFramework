/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import {
    FluidReactView,
    IFluidState,
    IViewState,
    SyncedDataObject,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Basic Clicker example using FluidReactView
 */
export class Clicker extends SyncedDataObject {
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
                fluidToView: new Map([
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
                syncedDataObject={this}
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

type CounterViewState = IViewState & ICounterState;
type CounterFluidState = IFluidState & ICounterState;

class CounterReactView extends FluidReactView<CounterViewState, CounterFluidState> {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div>
                <span className="value">
                    {this.state.counter?.value}
                </span>
                <button onClick={() => { this.state.counter?.increment(1); }}>+</button>
            </div>
        );
    }
}

// ----- FACTORY SETUP -----
export const ClickerInstantiationFactory =
    new DataObjectFactory<Clicker, unknown, unknown, IEvent>(
        "clicker",
        Clicker,
        [SharedCounter.getFactory()],
        {},
    );
export const fluidExport = ClickerInstantiationFactory;
