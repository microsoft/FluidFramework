/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { InventoryListContainerRuntimeFactory } from "./model/index.js";
import type { IInventoryListAppModel } from "./modelInterfaces.js";
import { DebugView, InventoryListAppView } from "./view/index.js";

const updateTabForId = (id: string): void => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (model: IInventoryListAppModel): void => {
	const appDiv = document.querySelector("#app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	ReactDOM.render(React.createElement(InventoryListAppView, { model }), appDiv);

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.querySelector("#debug") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(debugDiv);
	ReactDOM.render(
		React.createElement(DebugView, {
			model,
		}),
		debugDiv,
	);
};

async function start(): Promise<void> {
	const modelLoader = new TinyliciousModelLoader<IInventoryListAppModel>(
		new StaticCodeLoader(new InventoryListContainerRuntimeFactory()),
	);

	let id: string;
	let model: IInventoryListAppModel;

	if (location.hash.length === 0) {
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.slice(1);
		model = await modelLoader.loadExisting(id);
	}

	render(model);
	updateTabForId(id);
}

try {
	await start();
} catch (error) {
	console.error("Error starting tree comparison app:", error);
}
