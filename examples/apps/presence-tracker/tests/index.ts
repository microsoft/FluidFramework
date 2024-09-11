/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";
import { ITrackerAppModel, TrackerContainerRuntimeFactory } from "../src/containerCode.js";
import {
	renderFocusPresence,
	renderMousePresence,
	renderPointerPresence,
} from "../src/view.js";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function setup() {
	const sessionStorageModelLoader = new SessionStorageModelLoader<ITrackerAppModel>(
		new StaticCodeLoader(new TrackerContainerRuntimeFactory()),
	);

	let id: string;
	let model: ITrackerAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await sessionStorageModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await sessionStorageModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	// Render page focus information for audience members
	const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
	const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;
	const pointerContentDiv = document.getElementById("pointer-position") as HTMLDivElement;

	renderFocusPresence(model.focusTracker, contentDiv);
	renderMousePresence(model.mouseTracker, model.focusTracker, mouseContentDiv);
	renderPointerPresence(model.pointerTracker, pointerContentDiv);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory Fluid Server",
		"font-size:30px",
	);
});
