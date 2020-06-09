/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ITask } from "@fluidframework/runtime-definitions";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

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
        this.setupAgent();
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

    public setupAgent() {
        const agentTask: ITask = {
            id: "agent",
            instance: new ClickerAgent(this.counter),
        };
        this.taskManager.register(agentTask);
        this.taskManager.pick(this.url, "agent", true).then(() => {
            console.log(`Picked`);
        }, (err) => {
            console.log(err);
        });
    }

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
        this.props.counter.on("incremented", (incrementValue: number, currentValue: number) => {
            this.setState({ value: currentValue });
        });
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.value}
                </span>
                <button onClick={() => { this.props.counter.increment(1); }}>+</button>
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
