/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import type { IAppModel } from "./model-interface";
import { DebugView, AppView } from "./view";
import { TaskListCollectionContainerRuntimeFactory } from "./model";

const updateTabForId = (id: string): void => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (model: IAppModel, showExternalServerView: boolean): void => {
	const appDiv = document.querySelector("#app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	ReactDOM.render(React.createElement(AppView, { model }), appDiv);

	// The DebugView is just for demo purposes, to offer manual controls and inspectability for things that normally
	// would be some external system or arbitrarily occurring.
	if (showExternalServerView) {
		const debugDiv = document.querySelector("#debug") as HTMLDivElement;
		ReactDOM.unmountComponentAtNode(debugDiv);
		ReactDOM.render(React.createElement(DebugView, { model }), debugDiv);
	}
};

async function start(): Promise<void> {
	const tinyliciousModelLoader = new TinyliciousModelLoader<IAppModel>(
		new StaticCodeLoader(new TaskListCollectionContainerRuntimeFactory()),
	);

	let id: string;
	let model: IAppModel;
	let showExternalServerView: boolean = true;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("one");
		model = createResponse.model;

		id = await createResponse.attach();
	} else {
		id = location.hash.slice(1);
		model = await tinyliciousModelLoader.loadExisting(id);
		showExternalServerView = false;
	}
	model.taskListCollection.addTaskList({ externalTaskListId: "task-list-1" });
	const taskList = model.taskListCollection.getTaskList("task-list-1");
	console.log(model.taskListCollection);
	console.log(taskList);

	// Use a timeout in order to let task list instantiate. In the full flow,
	// we will wait on a response from the external server to return from registering
	// so this timeout won't be necessary
	setTimeout(() => {
		render(model, showExternalServerView);
		updateTabForId(id);
	}, 1000);
}

start().catch((error) => {
	console.error(error);
});
