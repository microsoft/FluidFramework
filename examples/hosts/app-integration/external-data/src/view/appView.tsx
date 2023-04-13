/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useState } from "react";

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

	const clientID = model.getClientID();
	const [leaderID, setLeaderID] = useState(model.baseDocument.getLeader());
	model.baseDocument.on("leaderChanged", (newLeader: string) => {
		setLeaderID(newLeader);
	});
	return taskList !== undefined ? (
		<TaskListView
			taskList={taskList}
			claimLeadership={(): void => {
				model.handleClaimLeadership();
			}}
			clientID={clientID}
			leaderID={leaderID}
		/>
	) : (
		<div>Whomp whomp whomp</div>
	);
};
