/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMap } from "@fluidframework/map";

import type { ITaskListCollection, ITaskListInitialState } from "../model-interface";
import { TaskList, TaskListInstantiationFactory } from "./taskList";

export class TaskListCollection extends DataObject implements ITaskListCollection {
	/**
	 * The taskLists map holds local facades on the data in order to render to the screen.
	 */
	private readonly taskLists = new Map<string, TaskList>();

	private _taskListCollection: SharedMap | undefined;

	private get taskListCollection(): SharedMap {
		if (this._taskListCollection === undefined) {
			throw new Error("The taskLists SharedMap has not yet been initialized.");
		}
		return this._taskListCollection;
	}

	public readonly deleteTaskList = (id: string): void => {
		if (!this.taskListCollection.has(id)) {
			return;
		}
		this.taskListCollection.delete(id);
	};

	public readonly getTaskList = (id: string): TaskList | undefined => {
		return this.taskLists.get(id);
	};

	public addTaskList = async (props: ITaskListInitialState): Promise<void> => {
		const externalTaskListId = props.externalTaskListId;
		if (externalTaskListId === undefined) {
			throw new Error("externalTaskListId is required to initialize task list");
		}
		const taskList = await TaskListInstantiationFactory.createChildInstance(
			this.context,
			props,
		);

		this.taskLists.set(externalTaskListId, taskList);

		this.emit("taskListAdded");
	};

	protected async initializingFirstTime(): Promise<void> {
		this._taskListCollection = SharedMap.create(this.runtime);
		this.root.set("task-list-collection", this._taskListCollection.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the task list collection.
	 */
	protected async hasInitialized(): Promise<void> {
		const taskListCollection = this.root.get<IFluidHandle<SharedMap>>("task-list-collection");
		if (taskListCollection === undefined) {
			throw new Error("taskListCollection was not initialized");
		}
		this._taskListCollection = await taskListCollection.get();
	}
}

export const TaskListCollectionInstantiationFactory = new DataObjectFactory<TaskListCollection>(
	"task-list-collection",
	TaskListCollection,
	[SharedMap.getFactory()],
	{},
	new Map([TaskListInstantiationFactory.registryEntry]),
);
