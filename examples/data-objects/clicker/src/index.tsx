/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { TaskManager } from "@fluid-experimental/task-manager";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import React from "react";
import { ClickerAgent } from "./agent";

export const ClickerName = "Clicker";

const counterKey = "counter";
const taskManagerKey = "taskManager";

const consoleLogTaskId = "ConsoleLog";

export interface IClickerEvents extends IEvent {
    (event: "incremented", listener: () => void);
}

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends DataObject<{ Events: IClickerEvents; }> {
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

        this.counter.on("incremented", () => { this.emit("incremented"); });
        this.setupAgent();
    }

    public increment() {
        this.counter.increment(1);
    }

    public get value() {
        return this.counter.value;
    }

    private setupAgent() {
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

export interface ClickerProps {
    clicker: Clicker;
}

export interface ClickerState {
    value: number;
}

export class ClickerReactView extends React.Component<ClickerProps, ClickerState> {
    constructor(props: ClickerProps) {
        super(props);

        this.state = {
            value: this.props.clicker.value,
        };
    }

    componentDidMount() {
        this.props.clicker.on("incremented", () => {
            this.setState({ value: this.props.clicker.value });
        });
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.value}
                </span>
                <button onClick={() => { this.props.clicker.increment(); }}>+</button>
            </div>
        );
    }
}

// ----- FACTORY SETUP -----

export const ClickerInstantiationFactory = new DataObjectFactory(
    ClickerName,
    Clicker,
    [SharedCounter.getFactory(), TaskManager.getFactory()],
    {},
);

const clickerViewCallback = (clicker: Clicker) => <ClickerReactView clicker={clicker} />;

export const fluidExport = new ContainerViewRuntimeFactory<Clicker>(ClickerInstantiationFactory, clickerViewCallback);
