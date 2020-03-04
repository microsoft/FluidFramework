/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponentHandle,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { Counter, CounterValueType, ISharedDirectory, ISharedMap, SharedMap } from "@microsoft/fluid-map";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const ClickerName = `${pkg.name as string}-clicker`;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private storedMap: ISharedMap | undefined;
    private counter: Counter | undefined;

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.createValueType("clicks", CounterValueType.Name, 0);

        const clicks = this.root.get<Counter>("clicks");
        clicks.increment(5);

        // Create a map on the root.
        const storedMap = SharedMap.create(this.runtime);
        this.root.set("storedMap", storedMap.handle);

        // Add another clicker to the map
        storedMap.createValueType("clicks2", CounterValueType.Name, 0);
    }

    protected async componentHasInitialized() {
        this.counter = this.root.get<Counter>("clicks");
        this.storedMap = await this.root.get<IComponentHandle<ISharedMap>>("storedMap").get();
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        if (!this.storedMap || !this.counter) {
            throw new Error("componentHasInitialized should be called prior to render");
        }

        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CounterReactView directory={this.root} storedMap={this.storedMap} counter={this.counter} />,
            div,
        );
    }

    // end IComponentHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Clicker.factory; }

    private static readonly factory = new PrimedComponentFactory(
        Clicker,
        [SharedMap.getFactory()],
    );
}

// ----- REACT STUFF -----

interface CounterProps {
    directory: ISharedDirectory;
    storedMap: ISharedMap;
    counter: Counter;
}

interface CounterState {
    value: number;
    value2: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value: this.props.counter.value,
            value2: this.props.storedMap.get<Counter>("clicks2").value,
        };
    }

    componentDidMount() {
        // Set a listener so when the counter increments we will update our state
        // counter is annoying because it only allows you to register one listener.
        // this causes problems when we have multiple views off the same counter.
        // so we are listening to the directory and map
        this.props.directory.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });

        this.props.storedMap.on("valueChanged", () => {
            this.setState({ value2: this.props.storedMap.get<Counter>("clicks2").value });
        });
    }

    render() {
        return (
            <div style={{border: "1px dotted blue"}}>
                <h3>Clicker</h3>
                <h5>Clicker on the root directory increments 1</h5>
                <div>
                    <span  className="clicker-value-class-5+1">{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(1); }}>+1</button>
                </div>
                <h5>Clicker on a map on the root directory increments 10</h5>
                <div>
                    <span className="clicker-value-class-0+10">{this.state.value2}</span>
                    <button onClick={() => { this.props.storedMap.get<Counter>("clicks2").increment(10); }}>+10</button>
                </div>
            </div>
        );
    }
}
