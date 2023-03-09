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
	 * The taskLists collection holds local facades on the data.  These facades encapsulate the data for a single task
	 * so we don't have to hand out references to the whole SharedDirectory.  Additionally, we only create them
	 * after performing the async operations to retrieve the constituent data (.get() the handles) which allows
	 * the ITask interface to be synchronous, and therefore easier to use in a view.  This is an example of the
	 * collection pattern -- see the contact-collection example for more details on this pattern.
	 */
	// private readonly taskLists = new Map<string, TaskList>();
	private _taskListCollection: SharedMap | undefined;

	private get taskListCollection(): SharedMap {
		if (this._taskListCollection === undefined) {
			throw new Error("The taskLists SharedMap has not yet been initialized.");
		}
		return this._taskListCollection;
	}

	public readonly deleteTaskList = (id: string): void => {
		if (!this.taskListCollection.has(id)) {
			throw new Error(`The task list with id ${id} does not exist in this collection.`);
		}
		this.taskListCollection.delete(id);
	};

	public readonly getTaskList = async (id: string): Promise<TaskList> => {
		const maybeHandle: IFluidHandle<TaskList> | undefined = this.taskListCollection.get(id);
		if (maybeHandle === undefined) {
			console.error("maybeHandle is undefined");
		}
		return maybeHandle.get();
	};

	public addTaskList = async (props?: ITaskListInitialState): Promise<void> => {
		const taskList = await TaskListInstantiationFactory.createChildInstance(
			this.context,
			props,
		);

		const externalTaskListId = props?.externalTaskListId as string;
		if (externalTaskListId !== undefined) {
			this.taskListCollection.set(externalTaskListId, taskList.handle);
		}
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

		// this._taskListCollection.on("valueChanged", (changed) => {
		// 	if (changed.previousValue === undefined) {
		// 		// Must be from adding a new task
		// 		this.handleTaskListAdded(changed.key).catch((error) => {
		// 			console.error(error);
		// 		});
		// 	} else if (this.taskLists.get(changed.key) === undefined) {
		// 		// Must be from a deletion
		// 		this.handleTaskListDeleted(changed.key);
		// 	} else {
		// 		// Since all data modifications happen within the SharedString or SharedCell (task IDs are immutable),
		// 		// the root directory should never see anything except adds and deletes.
		// 		console.error("Unexpected modification to task list");
		// 	}
		// });
	}

	// private readonly handleTaskListAdded = async (externalTaskListId: string): Promise<void> => {
	// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	// 	const tasklist = this._taskListCollection?.get(externalTaskListId);
	// 	if (tasklist === undefined) {
	// 		throw new Error("Newly added taskList is missing from task list collection map.");
	// 	}

	// 	// It's possible the task was deleted while getting the name/priority, in which case quietly exit.
	// 	if (this._taskListCollection?.get(externalTaskListId) === undefined) {
	// 		return;
	// 	}

	// 	const newTask = new TaskList({externalTaskListId});
	// 	this.tasks.set(externalTaskListId, newTask);
	// 	this.emit("draftTaskAdded", newTask);
	// };
}

export const TaskListCollectionInstantiationFactory = new DataObjectFactory<TaskListCollection>(
	"task-list-collection",
	TaskListCollection,
	[SharedMap.getFactory()],
	{},
	new Map([TaskListInstantiationFactory.registryEntry]),
);
