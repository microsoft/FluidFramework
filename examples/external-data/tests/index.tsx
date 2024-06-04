/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { BaseDocumentContainerRuntimeFactory } from "../src/model/index.js";
import type { IAppModel, ITaskList } from "../src/model-interface/index.js";
import { TaskListView } from "../src/view/index.js";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement): Promise<void> {
	const sessionStorageModelLoader = new SessionStorageModelLoader<IAppModel>(
		new StaticCodeLoader(new BaseDocumentContainerRuntimeFactory()),
	);

	let id: string;
	let model: IAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await sessionStorageModelLoader.createDetached("1.0");
		model = createResponse.model;

		id = await createResponse.attach();
		model.baseDocument.addTaskList({
			externalTaskListId: "task-list-test",
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			containerUrl: model.getContainerResolvedUrl()!,
		});
	} else {
		id = location.hash.slice(1);
		model = await sessionStorageModelLoader.loadExisting(id);
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
	// Add a test task so we can see something.
	taskList.addDraftTask("1", "testName", 3);

	// update the browser URL and the window title with the actual container ID
	// eslint-disable-next-line require-atomic-updates
	location.hash = id;
	document.title = id;

	const clientID = model.getClientID();
	const leaderID = model.baseDocument.getLeader();

	// Render it
	ReactDOM.render(
		<TaskListView
			taskList={taskList}
			claimLeadership={(): void => {
				model.handleClaimLeadership();
			}}
			clientID={clientID}
			leaderID={leaderID}
		/>,
		element,
	);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup(): Promise<void> {
	const leftElement = document.querySelector("#sbs-left") as HTMLDivElement;
	if (leftElement === null) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(leftElement);
	const rightElement = document.querySelector("#sbs-right") as HTMLDivElement;
	if (rightElement === null) {
		throw new Error("sbs-right does not exist");
	}
	await createContainerAndRenderInElement(rightElement);
}

setup()
	.then(() => {
		console.log("App launched successfully!");
	})
	// eslint-disable-next-line unicorn/prefer-top-level-await
	.catch((error) => {
		console.error(error);
		console.log(
			"%cThere were issues setting up and starting the in memory Fluid Server",
			"font-size:30px",
		);
	});
