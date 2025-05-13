/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISameContainerMigratableModel,
	IVersionedModel,
	SameContainerMigrator,
	SessionStorageModelLoader,
} from "@fluid-example/example-utils";

import React from "react";
import ReactDOM from "react-dom";

import { inventoryListDataTransformationCallback } from "../src/dataTransform.js";
import { DemoCodeLoader } from "../src/demoCodeLoader.js";
import type { IInventoryListAppModel } from "../src/modelInterfaces.js";
import { DebugView, InventoryListAppView } from "../src/view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const isIInventoryListAppModel = (model: IVersionedModel): model is IInventoryListAppModel => {
	return model.version === "one" || model.version === "two";
};

const getUrlForContainerId = (containerId: string) => `/#${containerId}`;

// Store the migrators on the window so our tests can more easily observe the migration happening
// eslint-disable-next-line @typescript-eslint/dot-notation
window["migrators"] = [];

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
	const modelLoader = new SessionStorageModelLoader<IInventoryListAppModel>(
		new DemoCodeLoader(),
	);
	let id: string;
	let model: ISameContainerMigratableModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await modelLoader.createDetached("one");
		model = createResponse.model;

		// Should be the same as the uuid we generated above.
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	const render = (model: IVersionedModel) => {
		ReactDOM.unmountComponentAtNode(appDiv);
		// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
		// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
		// view code loader to pull in the view dynamically based on the version we discover.
		if (isIInventoryListAppModel(model)) {
			ReactDOM.render(React.createElement(InventoryListAppView, { model }), appDiv);

			// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
			ReactDOM.unmountComponentAtNode(debugDiv);
			ReactDOM.render(
				React.createElement(DebugView, {
					model,
					summarizeOnDemand: model.DEBUG_summarizeOnDemand,
					getUrlForContainerId,
				}),
				debugDiv,
			);
		} else {
			throw new Error(`Don't know how to render version ${model.version}`);
		}
	};

	const migrator = new SameContainerMigrator(
		modelLoader,
		model,
		id,
		inventoryListDataTransformationCallback,
	);
	migrator.on("migrated", () => {
		model.close();
		render(migrator.currentModel);
		updateTabForId(migrator.currentModelId);
		model = migrator.currentModel;
	});

	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["migrators"].push(migrator);

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(model);

	element.append(appDiv, debugDiv);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
	const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
	if (leftElement === null) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(leftElement);
	const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
	if (rightElement === null) {
		throw new Error("sbs-right does not exist");
	}
	await createContainerAndRenderInElement(rightElement);
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory Fluid Server",
		"font-size:30px",
	);
});
