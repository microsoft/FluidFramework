/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";

import type { ITaskListCollection, ITaskListInitialState } from "../model-interface";
import { TaskList, TaskListInstantiationFactory } from "./taskList";

export class TaskListCollection extends DataObject implements ITaskListCollection {
	/**
	 * The taskLists map holds local facades on the data in order to render to the screen.
	 */
	private readonly taskLists = new Map<string, TaskList>();

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
}

export const TaskListCollectionInstantiationFactory = new DataObjectFactory<TaskListCollection>(
	"task-list-collection",
	TaskListCollection,
	[
		SharedMap.getFactory(),
		SharedCell.getFactory(),
		SharedString.getFactory(),
		SharedMap.getFactory(),
	],
	{},
	new Map([TaskListInstantiationFactory.registryEntry]),
);
