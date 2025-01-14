/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IEvent, IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/legacy";
import { TaskManager } from "@fluidframework/task-manager/legacy";
import React from "react";

import { ClickerAgent } from "./agent.js";

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
export class Clicker extends DataObject<{ Events: IClickerEvents }> {
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

		this.counter.on("incremented", () => {
			this.emit("incremented");
		});
		this.setupAgent();
	}

	public increment() {
		this.counter.increment(1);
	}

	public get value() {
		return this.counter.value;
	}

	private setupAgent() {
		// We want to make sure that at any given time there is one (and only one) client executing the console log
		// task. Each client will enter the queue on startup.
		// Additionally, we use subscribeToTask() instead of volunteerForTask() since we always want to stay
		// volunteered because this is an ongoing and not a one-time task.
		const clickerAgent = new ClickerAgent(this.counter);
		this.taskManager.subscribeToTask(consoleLogTaskId);
		this.taskManager.on("assigned", (taskId: string) => {
			if (taskId === consoleLogTaskId) {
				console.log("Assigned:", (this.taskManager as any).runtime.clientId);
				void clickerAgent.run();
			}
		});
		this.taskManager.on("lost", (taskId: string) => {
			if (taskId === consoleLogTaskId) {
				clickerAgent.stop();
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
				<button
					onClick={() => {
						this.props.clicker.increment();
					}}
				>
					+
				</button>
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

export const fluidExport = new ContainerViewRuntimeFactory<Clicker>(
	ClickerInstantiationFactory,
	clickerViewCallback,
);
