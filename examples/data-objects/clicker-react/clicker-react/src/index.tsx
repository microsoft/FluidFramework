/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    FluidReactView,
    IFluidState,
    IViewState,
    SyncedDataObject,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";

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
    new DataObjectFactory(
        "clicker",
        Clicker,
        [SharedCounter.getFactory()],
        {},
    );

const clickerViewCallback = (clicker: Clicker) =>
    <CounterReactView
        syncedStateId={ "clicker" }
        syncedDataObject={ clicker }
    />;

export const fluidExport =
    new ContainerViewRuntimeFactory<Clicker>(ClickerInstantiationFactory, clickerViewCallback);
