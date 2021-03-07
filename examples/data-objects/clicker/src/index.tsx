/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IAgentScheduler } from "@fluidframework/runtime-definitions";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

export const ClickerName = "Clicker";

const counterKey = "counter";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async hasInitialized() {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle?.get();
        this.setupAgent();
    }

    // #region IFluidHTMLView

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

    // #endregion IFluidHTMLView

    public setupAgent() {
        const agentTaskId = "agent";
        const clickerAgent = new ClickerAgent(this.counter);

        this.context.containerRuntime.request({ url: "/_scheduler" }).then(async (agentSchedulerResponse) => {
            if (agentSchedulerResponse.status === 404) {
                throw new Error("Agent scheduler not found");
            }
            const agentScheduler = agentSchedulerResponse.value as IAgentScheduler;
            await agentScheduler.pick(agentTaskId, async () => {
                console.log(`Picked`);
                await clickerAgent.run();
            });
        }).catch((err) => { console.error(err); });
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

export const ClickerInstantiationFactory = new DataObjectFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory()],
    {},
);

export const fluidExport = ClickerInstantiationFactory;
