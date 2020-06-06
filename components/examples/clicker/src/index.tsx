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
    FluidComponentMap,
} from "@fluidframework/aqueduct-react";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
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
    counter: SharedCounter;
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

    private _counter: SharedCounter | undefined;
    private readonly _fluidComponentMap: FluidComponentMap = new Map();

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(CounterRootKey, counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = this.root.get<IComponentHandle<SharedCounter>>(CounterRootKey);
        this._counter = await counterHandle.get();
        this._fluidComponentMap.set(this._counter.handle.path, {
            component: this._counter,
            listenedEvents: ["incremented"],
        });
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(element: HTMLElement) {
        if (this._counter === undefined || this._fluidComponentMap === undefined) {
            throw Error("Component was not initialized correctly");
        }
        // Load initial state from root before entering React render lifecycle
        // View and Fluid states are identical since we are directly using the Counter
        // DDS in the view
        const initialState = { counter:  this._counter };

        // Mark the counter as the CounterValueType so that changes to it update the React view
        // when we increment it and the key it is stored under in the root
        const fluidToView: FluidToViewMap<CounterViewState, CounterFluidState> = new Map();
        fluidToView.set(CounterRootKey, {
            fluidObjectType: SharedCounter.name,
        });

        ReactDOM.render(
            <CounterReactView
                syncedStateId={"clicker"}
                root={this.root}
                initialViewState={initialState}
                initialFluidState={initialState}
                dataProps={{
                    fluidComponentMap: this._fluidComponentMap,
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

// ----- FACTORY SETUP -----
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerInstantiationFactory;
