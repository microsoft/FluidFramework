/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

export const ClickerName = "Clicker";

const counterKey = "counter";
const taskManagerKey = "taskManager";

const consoleLogTaskId = "ConsoleLog";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private _counter: SharedCounter | undefined;
    private _taskManager: TaskManager | undefined;

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
        const taskManager = TaskManager.create(this.runtime);
        this.root.set(taskManagerKey, taskManager.handle);
    }

    protected async hasInitialized() {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle?.get();
        const taskManagerHandle = this.root.get<IFluidHandle<TaskManager>>(taskManagerKey);
        this._taskManager = await taskManagerHandle?.get();

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
        this.taskManager.lockTask(consoleLogTaskId)
            .then(async () => {
                console.log(`Picked`);
                const clickerAgent = new ClickerAgent(this.counter);
                // Attempt to reacquire the task if we lose it
                this.taskManager.once("lost", () => {
                    clickerAgent.stop();
                    this.setupAgent();
                });
                await clickerAgent.run();
            }).catch(() => {
                // We're not going to abandon our attempt, so if the promise rejects it probably means we got
                // disconnected.  So we'll try again once we reconnect.  If it was for some other reason, we'll
                // give up.
                if (!this.runtime.connected) {
                    this.runtime.once("connected", () => { this.setupAgent(); });
                }
            });
    }

    private get counter() {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }

    private get taskManager() {
        if (this._taskManager === undefined) {
            throw new Error("TaskManager not initialized");
        }
        return this._taskManager;
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

export const ClickerInstantiationFactory = new DataObjectFactory<Clicker, undefined, undefined, IEvent>(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory(), TaskManager.getFactory()],
    {},
);

export const fluidExport = ClickerInstantiationFactory;
