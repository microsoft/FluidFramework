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

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (model: IInventoryListAppModel) => {
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
	let id: string;
	let model: IInventoryListAppModel;

	if (location.hash.length === 0) {
		const modelLoader = new TinyliciousModelLoader<IInventoryListAppModel>(
			new StaticCodeLoader(new InventoryListContainerRuntimeFactory(false)),
		);
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		const modelLoader = new TinyliciousModelLoader<IInventoryListAppModel>(
			new StaticCodeLoader(new InventoryListContainerRuntimeFactory(true)),
		);
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
	}

	render(model);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
