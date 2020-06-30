/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import { injectSharedObjectInterception } from "@fluidframework/dds-interceptions";
import React from "react";
import ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

const counterKey = "counter";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = this.root.get<IComponentHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle.get();
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CounterReactView counter={this.counter} />,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView

    private get counter() {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }
}

// ----- REACT STUFF -----

interface CounterProps {
    counter: SharedCounter;
}

type CounterState = CounterProps;

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);
        this.state = {
            counter: props.counter,
        };
    }

    componentDidMount() {
        const { counter } = this.state;
        injectSharedObjectInterception(counter, []);
        counter.on("update", (newCounter: SharedCounter) => {
            this.setState({ counter: newCounter });
        });
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class">
                    {this.state.counter.value}
                </span>
                <button onClick={() => { this.state.counter.increment(1); }}>+</button>
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
