/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { GroceryListContainerRuntimeFactory } from "./model/index.js";
import type { IGroceryListAppModel } from "./modelInterfaces.js";
import { DebugView, InventoryListAppView } from "./view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (model: IGroceryListAppModel) => {
	const appDiv = document.getElementById("app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	ReactDOM.render(React.createElement(InventoryListAppView, { model }), appDiv);

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.getElementById("debug") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(debugDiv);
	ReactDOM.render(
		React.createElement(DebugView, {
			model,
		}),
		debugDiv,
	);
};

async function start(): Promise<void> {
	const modelLoader = new TinyliciousModelLoader<IGroceryListAppModel>(
		new StaticCodeLoader(new GroceryListContainerRuntimeFactory()),
	);

	let id: string;
	let model: IGroceryListAppModel;

	if (location.hash.length === 0) {
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
	}

	render(model);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
