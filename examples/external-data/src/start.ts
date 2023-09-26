/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import type { IAppModel, ITaskList } from "./model-interface";
import { DebugView, AppView } from "./view";
import { BaseDocumentContainerRuntimeFactory } from "./model";

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
		new StaticCodeLoader(new BaseDocumentContainerRuntimeFactory()),
	);

	let id: string;
	let model: IAppModel;
	let showExternalServerView: boolean = true;
	let containerUrl;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("one");
		model = createResponse.model;

		id = await createResponse.attach();

		containerUrl = model.getContainerResolvedUrl();
		if (containerUrl === undefined) {
			throw new Error("Container is not attached");
		}
		// Hardcoding a taskListId here. A follow up will be to introduce a form
		// where the user can enter an external taskListId that they want
		// to import from the external server.
		model.baseDocument.addTaskList({
			externalTaskListId: "task-list-1",
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			containerUrl,
		});
	} else {
		id = location.hash.slice(1);
		model = await tinyliciousModelLoader.loadExisting(id);
		showExternalServerView = false;
	}

	// This block is necessary so that we render after the task list
	// has instantiated. In a future PR this will go away, replaced
	// by the registration api call.
	let taskList: ITaskList | undefined;
	while (taskList === undefined) {
		const taskListsChangedP = new Promise<void>((resolve) => {
			model.baseDocument.once("taskListCollectionChanged", () => {
				resolve();
			});
		});
		taskList = model.baseDocument.getTaskList("task-list-1");
		if (taskList === undefined) {
			await taskListsChangedP;
		}
	}

	render(model, showExternalServerView);
	updateTabForId(id);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch((error) => {
	console.error(error);
});
