/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect } from "react";
import { RecoilRoot } from "recoil";
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
	const debugView = <DebugView model={model} />;
	useEffect(() => {}, [model]);
	return (
		<RecoilRoot>
			{showExternalServerView && debugView}
			<TaskListView taskList={model.taskList} />
		</RecoilRoot>
	);
};
