/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

const storedMapKey = "storedMap";
const counter1Key = "counter";
const counter2Key = "counter2";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private counter1: SharedCounter | undefined;
    private counter2: SharedCounter | undefined;

    public static readonly ComponentName = `@fluid-example/pond-clicker`;

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counter1Key, counter.handle);
        counter.increment(5);

        // Create a map on the root.
        const storedMap = SharedMap.create(this.runtime);
        this.root.set(storedMapKey, storedMap.handle);

        // Add another clicker to the map
        const counter2 = SharedCounter.create(this.runtime);
        storedMap.set(counter2Key, counter2.handle);
    }

    protected async hasInitialized() {
        const counter1Handle = this.root.get<IFluidHandle<SharedCounter>>(counter1Key);
        this.counter1 = await counter1Handle?.get();

        const storedMap = await this.root.get<IFluidHandle<ISharedMap>>(storedMapKey)?.get();
        const counter2Handle = storedMap?.get<IFluidHandle<SharedCounter>>(counter2Key);
        this.counter2 = await counter2Handle?.get();
    }

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        if (this.counter1 === undefined || this.counter2 === undefined) {
            throw new Error("hasInitialized should be called prior to render");
        }

        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CounterReactView counter1={this.counter1} counter2={this.counter2} />,
            div,
        );
    }

    // end IFluidHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Clicker.factory; }

    private static readonly factory = new DataObjectFactory(
        Clicker.ComponentName,
        Clicker,
        [
            SharedCounter.getFactory(),
            SharedMap.getFactory(),
        ],
        {});
}

// ----- REACT STUFF -----

interface CounterProps {
    counter1: SharedCounter;
    counter2: SharedCounter;
}

interface CounterState {
    value1: number;
    value2: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value1: this.props.counter1.value,
            value2: this.props.counter2.value,
        };
    }

    async componentDidMount() {
        // Set a listener so when the counter increments we will update our state
        this.props.counter1.on("incremented", () => {
            this.setState({ value1: this.props.counter1.value });
        });
        this.props.counter2.on("incremented", () => {
            this.setState({ value2: this.props.counter2.value });
        });
    }

    render() {
        return (
            <div style={{ border: "1px dotted blue" }}>
                <h3>Clicker</h3>
                <h5>Clicker on the root directory increments 1</h5>
                <div>
                    <span className="clicker-value-class-5">{this.state.value1}</span>
                    <button onClick={() => { this.props.counter1.increment(1); }}>+1</button>
                </div>
                <h5>Clicker on a map on the root directory increments 10</h5>
                <div>
                    <span className="clicker-value-class-10">{this.state.value2}</span>
                    <button onClick={() => { this.props.counter2.increment(10); }}>+10</button>
                </div>
            </div>
        );
    }
}
