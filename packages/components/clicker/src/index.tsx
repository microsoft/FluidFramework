/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { Counter, CounterValueType, ISharedDirectory } from "@microsoft/fluid-map";
import { ITask, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

let batchCount = 0;
let opsCount = 0;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.createValueType("clicks", CounterValueType.Name, 0);
        if (!this.runtime.connected) {
            await new Promise<void>((resolve) => this.runtime.on("connected", () => resolve()));
        }
        this.setupAgent();
    }

    protected async componentInitializingFromExisting() {
        this.setupAgent();
    }

    // #region IComponentHTMLVisual

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
    // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(
            <CounterReactView counter={counter} sharedDirectory={this.root} runtime={this.context.hostRuntime}/>,
            div,
        );
        return div;
    }

    public setupAgent() {
        const counter: Counter = this.root.get("clicks");
        const agentTask: ITask = {
            id: "agent",
            instance: new ClickerAgent(counter),
        };
        this.taskManager.register(agentTask);
        this.taskManager.pick(this.url, "agent", true).then(() => {
            console.log(`Picked`);
        }, (err) => {
            console.log(err);
        });
    }

    // #endregion IComponentHTMLVisual
}

// ----- REACT STUFF -----

interface CounterProps {
    counter: Counter;
    sharedDirectory: ISharedDirectory;
    runtime: IHostRuntime;
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
                <br />
                <button onClick={
                    () => {
                        this.props.runtime.orderSequentially(() => {
                            batchCount++;
                            for (let i = 0; i < 100; i++) {
                                this.props.sharedDirectory.set(`batch-${batchCount}`, i);
                            }
                        });
                    }
                }>
                    + (Batches)
                </button>
                <br />
                <button onClick={
                    () => {
                        this.props.counter.increment(1);
                        opsCount++;
                        for (let i = 0; i < 10; i++) {
                            this.props.sharedDirectory.set(`ops-${opsCount}`, i);
                        }
                    }
                }>
                    + (Ops)
                </button>
            </div>
        );
    }
}

// ----- FACTORY SETUP -----

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker,
    [],
);

export const fluidExport = ClickerInstantiationFactory;
