/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useState } from "react";
import type { IAppModel } from "../model-interface";
import { DebugView } from "./debugView";
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
	// The DebugView is just for demo purposes, to offer manual controls and inspectability for things that normally
	// would be some external system or arbitrarily occurring.
	const showExternalServerView: boolean = true;
	// Flag that represents presence/absence of unresolved changes after fetching external data.
	const [unresolvedChanges, setUnresolvedChanges] = useState(false);
	// useEffect(() => {console.log("hooks changed")}, [unresolvedChanges, fetchingExternalData]);
	const debugView = <DebugView model={model} unresolvedChanges={unresolvedChanges} />;
	return (
		<div>
			{showExternalServerView && debugView}
			<TaskListView taskList={model.taskList} setUnresolvedChanges={setUnresolvedChanges} />
		</div>
	);
};
