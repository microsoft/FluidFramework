/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import {
	ITaskSelectionAppModel,
	TaskSelectionContainerRuntimeFactory,
} from "./containerCode.js";
import { renderDiceRoller } from "./view.js";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const tinyliciousModelLoader = new TinyliciousModelLoader<ITaskSelectionAppModel>(
		new StaticCodeLoader(new TaskSelectionContainerRuntimeFactory()),
	);

	let id: string;
	let model: ITaskSelectionAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
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

	const div = document.getElementById("content") as HTMLDivElement;
	div.append(taskManagerDiv, divider, oldestClientDiv);
}

start().catch((error) => console.error(error));
