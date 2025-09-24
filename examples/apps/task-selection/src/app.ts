/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";

import {
	type ITaskSelectionAppModel,
	TaskSelectionContainerRuntimeFactory,
} from "./containerCode.js";
import { renderDiceRoller } from "./view.js";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new TaskSelectionContainerRuntimeFactory());

	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		// Some services support or require specifying the container id at attach time (local, odsp). For
		// services that do not (t9s), the passed id will be ignored.
		id = Date.now().toString();
		const createNewRequest = createCreateNewRequest(id);
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		await container.attach(createNewRequest);
		// For most services, the id on the resolvedUrl is the authoritative source for the container id
		// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
		// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
		// we retain the id we generated above.
		if (service !== "odsp") {
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url unexpectedly missing!");
			}
			id = container.resolvedUrl.id;
		}
	} else {
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	// Get the model from the container
	const model = (await container.getEntryPoint()) as ITaskSelectionAppModel;

	// update the browser URL and the window title with the actual container ID
	// eslint-disable-next-line require-atomic-updates
	location.hash = id;
	document.title = id;

	// Demo 1: Using TaskManager
	const taskManagerDiv = document.createElement("div");
	const taskManagerHeaderDiv = document.createElement("div");
	taskManagerHeaderDiv.style.textAlign = "center";
	taskManagerHeaderDiv.style.fontSize = "50px";
	taskManagerHeaderDiv.textContent = "TaskManager";
	const taskManagerViewDiv = document.createElement("div");
	renderDiceRoller(model.taskManagerDiceRoller, taskManagerViewDiv);
	taskManagerDiv.append(taskManagerHeaderDiv, taskManagerViewDiv);

	const divider = document.createElement("hr");

	// Demo 2: Using OldestClientObserver
	const oldestClientDiv = document.createElement("div");
	const oldestClientHeaderDiv = document.createElement("div");
	oldestClientHeaderDiv.style.textAlign = "center";
	oldestClientHeaderDiv.style.fontSize = "50px";
	oldestClientHeaderDiv.textContent = "OldestClientObserver";
	const oldestClientViewDiv = document.createElement("div");
	renderDiceRoller(model.oldestClientDiceRoller, oldestClientViewDiv);
	oldestClientDiv.append(oldestClientHeaderDiv, oldestClientViewDiv);

	const div = document.querySelector("#content") as HTMLDivElement;
	div.append(taskManagerDiv, divider, oldestClientDiv);
}

await start();
