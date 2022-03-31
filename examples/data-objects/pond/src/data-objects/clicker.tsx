/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import React from "react";

const storedMapKey = "storedMap";
const counter1Key = "counter";
const counter2Key = "counter2";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class DoubleCounter extends DataObject {
    private _counter1: SharedCounter | undefined;
    public get counter1(): SharedCounter {
        if (this._counter1 === undefined) {
            throw new Error("Counter1 accessed before initialized");
        }
        return this._counter1;
    }

    private _counter2: SharedCounter | undefined;
    public get counter2(): SharedCounter {
        if (this._counter2 === undefined) {
            throw new Error("Counter2 accessed before initialized");
        }
        return this._counter2;
    }

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
        this._counter1 = await counter1Handle?.get();

        const storedMap = await this.root.get<IFluidHandle<ISharedMap>>(storedMapKey)?.get();
        const counter2Handle = storedMap?.get<IFluidHandle<SharedCounter>>(counter2Key);
        this._counter2 = await counter2Handle?.get();
    }

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return DoubleCounter.factory; }

    private static readonly factory = new DataObjectFactory(
        DoubleCounter.ComponentName,
        DoubleCounter,
        [
            SharedCounter.getFactory(),
            SharedMap.getFactory(),
        ],
        {});
}

// ----- REACT STUFF -----

export interface DoubleCounterViewProps {
    counter1: SharedCounter;
    counter2: SharedCounter;
}

interface DoubleCounterViewState {
    value1: number;
    value2: number;
}

export class DoubleCounterView extends React.Component<DoubleCounterViewProps, DoubleCounterViewState> {
    constructor(props: DoubleCounterViewProps) {
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
