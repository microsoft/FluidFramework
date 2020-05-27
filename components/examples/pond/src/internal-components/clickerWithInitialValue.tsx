/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { Counter, CounterValueType, ISharedDirectory } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");

export interface IClickerInitialState {
    initialValue: number;
}

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class ClickerWithInitialValue extends PrimedComponent<{}, IClickerInitialState> implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public static readonly ComponentName = `${pkg.name as string}-clicker-with-initial-value`;

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime(initialState?: IClickerInitialState) {
        let startingValue = 0;
        if (initialState) {
            startingValue = initialState.initialValue;
        }

        this.root.createValueType("clicks", CounterValueType.Name, startingValue);
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(
            <CounterReactView directory={this.root}counter={counter} />,
            div,
        );
    }

    public static getFactory() { return ClickerWithInitialValue.factory; }

    private static readonly factory = new PrimedComponentFactory(
        ClickerWithInitialValue.ComponentName,
        ClickerWithInitialValue,
        [],
        {});
}

// ----- REACT STUFF -----

interface CounterProps {
    directory: ISharedDirectory;
    counter: Counter;
}

interface CounterState {
    value: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value: this.props.counter.value,
        };
    }

    componentDidMount() {
        // Set a listener so when the counter increments we will update our state
        // counter is annoying because it only allows you to register one listener.
        // this causes problems when we have multiple views off the same counter.
        // so we are listening to the directory
        this.props.directory.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });
    }

    render() {
        return (
            <div style={{ border: "1px dotted red" }}>
                <h3>Clicker With Initial Value</h3>
                <h5>Created with initial value of 100. Increments 5.</h5>
                <div>
                    <span className="clicker-value-class-100+5">{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(5); }}>+5</button>
                </div>
            </div>
        );
    }
}
