/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, SharedComponentFactory } from "@prague/aqueduct";
import {
    IComponentHandle,
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
    Counter,
    CounterValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const ClickerName = `${pkg.name as string}-clicker`;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    private otherMap: ISharedMap | undefined;
    private counter: Counter | undefined;

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("clicks", 0, CounterValueType.Name);

        const clicks = this.root.get<Counter>("clicks");
        clicks.increment(5);

        // Create a second map on the root.
        const otherMap = SharedMap.create(this.runtime);
        this.root.set("secondMap", otherMap.handle);

        // Add another clicker to the second map
        otherMap.set("clicks2", 0, CounterValueType.Name);
    }

    protected async componentHasInitialized() {
        this.counter = this.root.get<Counter>("clicks");
        this.otherMap = await this.root.get<IComponentHandle>("secondMap").get<ISharedMap>();
    }

    // start IComponentHTMLVisual

    public render(div: HTMLElement) {
        if (!this.otherMap || !this.counter) {
            throw new Error("componentHasInitialized should be called prior to render");
        }

        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CounterReactView map={this.root} otherMap={this.otherMap} counter={this.counter} />,
            div,
        );
    }

    // end IComponentHTMLVisual

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Clicker.factory; }

    private static readonly factory = new SharedComponentFactory(
        Clicker,
        [
            SharedMap.getFactory([new CounterValueType()]),
        ],
    );
}

// ----- REACT STUFF -----

interface p {
    map: ISharedMap;
    otherMap: ISharedMap;
    counter: Counter;
}

interface s {
    value: number;
    value2: number;
}

class CounterReactView extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            value: this.props.counter.value,
            value2: this.props.otherMap.get<Counter>("clicks2").value,
        };
    }

    componentDidMount() {
        // set a listener so when the counter increments we will update our state
        // counter is annoying because it only allows you to register one listener.
        // this causes problems when we have multiple views off the same counter.
        // so we are listening to the map
        this.props.map.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });

        this.props.otherMap.on("valueChanged", () => {
            this.setState({ value2: this.props.otherMap.get<Counter>("clicks2").value });
        });
    }

    render() {
        return (
            <div style={{border: "1px dotted blue"}}>
                <h3>Clicker</h3>
                <h5>Clicker on the root map increments 1</h5>
                <div>
                    <span>{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(1); }}>+1</button>
                </div>
                <h5>Clicker on a map on the root map increments 10</h5>
                <div>
                    <span>{this.state.value2}</span>
                    <button onClick={() => { this.props.otherMap.get<Counter>("clicks2").increment(10); }}>+10</button>
                </div>
            </div>
        );
    }
}
