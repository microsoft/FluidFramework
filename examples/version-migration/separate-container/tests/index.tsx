/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getModelAndMigrationToolFromContainer,
	IMigratableModel,
	IMigrationTool,
	IVersionedModel,
	Migrator,
	SessionStorageSimpleLoader,
} from "@fluid-example/migration-tools/internal";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

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

const isIInventoryListAppModel = (
	model: IVersionedModel,
): model is IInventoryListAppModel & IMigratableModel => {
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
	const searchParams = new URLSearchParams(location.search);
	const testMode = searchParams.get("testMode") !== null;
	const loader = new SessionStorageSimpleLoader(new DemoCodeLoader(testMode));
	let id: string;
	let model: IMigratableModel;
	let migrationTool: IMigrationTool;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const { container, attach } = await loader.createDetached("one");
		const modelAndMigrationTool =
			await getModelAndMigrationToolFromContainer<IMigratableModel>(container);
		model = modelAndMigrationTool.model;
		migrationTool = modelAndMigrationTool.migrationTool;
		id = await attach();
	} else {
		id = location.hash.slice(1);
		const container = await loader.loadExisting(id);
		const modelAndMigrationTool =
			await getModelAndMigrationToolFromContainer<IMigratableModel>(container);
		model = modelAndMigrationTool.model;
		migrationTool = modelAndMigrationTool.migrationTool;
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	let appRoot: Root | undefined;
	let debugRoot: Root | undefined;

	const render = (model: IVersionedModel, migrationTool: IMigrationTool) => {
		// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
		// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
		// view code loader to pull in the view dynamically based on the version we discover.
		if (isIInventoryListAppModel(model)) {
			if (appRoot !== undefined) {
				appRoot.unmount();
			}
			appRoot = createRoot(appDiv);
			appRoot.render(createElement(InventoryListAppView, { model, migrationTool }));

			// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
			if (debugRoot !== undefined) {
				debugRoot.unmount();
			}
			debugRoot = createRoot(debugDiv);
			debugRoot.render(
				createElement(DebugView, {
					model,
					migrationTool,
					getUrlForContainerId,
				}),
			);
		} else {
			throw new Error(`Don't know how to render version ${model.version}`);
		}
	};

	const migrator = new Migrator(
		loader,
		model,
		migrationTool,
		id,
		inventoryListDataTransformationCallback,
	);
	migrator.events.on("migrated", () => {
		model.dispose();
		model = migrator.currentModel;
		migrationTool = migrator.currentMigrationTool;
		render(model, migrationTool);
		updateTabForId(migrator.currentModelId);
	});

	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["migrators"].push(migrator);

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(model, migrationTool);

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
