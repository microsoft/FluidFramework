/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IAppModel } from "../model-interface";
import { TaskListView } from "./taskListView";

/**
 * {@link AppView} input props.
 */
export interface IAppViewProps {
	/**
	 * The Task List app model to be visualized.
	 */
	model: IAppModel;
}

/**
 * The AppView is made to pair with an AppModel and render its contents appropriately.
 */
export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
	const { model } = props;
	const taskList = model.baseDocument.getTaskList("task-list-1");
	return taskList !== undefined ? (
		<TaskListView taskList={taskList} />
	) : (
		<div>Whomp whomp whomp</div>
	);
};
