/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISameContainerMigratableModel,
	IVersionedModel,
} from "@fluid-example/example-utils";
import { ModelLoader, SameContainerMigrator } from "@fluid-example/example-utils";
import { createRouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/legacy";
import {
	createInsecureTinyliciousTestTokenProvider,
	createInsecureTinyliciousTestUrlResolver,
	createTinyliciousTestCreateNewRequest,
} from "@fluidframework/tinylicious-driver/test-utils";
import React from "react";
import ReactDOM from "react-dom";

import { inventoryListDataTransformationCallback } from "./dataTransform.js";
import { DemoCodeLoader } from "./demoCodeLoader.js";
import type { IInventoryListAppModel } from "./modelInterfaces.js";
import { DebugView, InventoryListAppView } from "./view/index.js";

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

const render = (model: IVersionedModel) => {
	const appDiv = document.getElementById("app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
	// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
	// view code loader to pull in the view dynamically based on the version we discover.
	if (isIInventoryListAppModel(model)) {
		ReactDOM.render(React.createElement(InventoryListAppView, { model }), appDiv);

		// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
		const debugDiv = document.getElementById("debug") as HTMLDivElement;
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

async function start(): Promise<void> {
	// If we assumed the container code could consistently present a model to us, we could bake that assumption
	// in here as well as in the Migrator -- both places just need a reliable way to get a model regardless of the
	// (unknown) container version.  So the ModelLoader would be replaced by whatever the consistent request call
	const modelLoader = new ModelLoader<IInventoryListAppModel>({
		urlResolver: createInsecureTinyliciousTestUrlResolver(),
		documentServiceFactory: createRouterliciousDocumentServiceFactory(
			createInsecureTinyliciousTestTokenProvider(),
		),
		codeLoader: new DemoCodeLoader(),
		generateCreateNewRequest: createTinyliciousTestCreateNewRequest,
	});

	let id: string;
	let model: ISameContainerMigratableModel;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createResponse = await modelLoader.createDetached("one");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
	}

	// The Migrator takes the starting state (model and id) and watches for a migration proposal.  It encapsulates
	// the migration logic and just lets us know when a new model is loaded and available (with the "migrated" event).
	// It also takes a dataTransformationCallback to help in transforming data export format to be compatible for
	// import with newly created models.
	const migrator = new SameContainerMigrator(
		modelLoader,
		model,
		id,
		inventoryListDataTransformationCallback,
	);
	migrator.on("migrated", () => {
		// TODO: Should the model be forcibly closed prior to raising the migrated event?
		model.close();
		model = migrator.currentModel;
		render(migrator.currentModel);
		updateTabForId(migrator.currentModelId);
	});
	// If the ModelLoader doesn't know how to load the model required for migration, it emits "migrationNotSupported".
	// For example, this might be hit if another client has a newer ModelLoader and proposes a version our
	// ModelLoader doesn't know about.
	// However, this will never be hit in this demo since we have a finite set of models to support.  If the model
	// code loader pulls in the appropriate model dynamically, this might also never be hit since all clients
	// are theoretically referencing the same model library.
	migrator.on("migrationNotSupported", (version: string) => {
		// To move forward, we would need to acquire a model loader capable of loading the given model, retry the
		// load, and set up a new Migrator with the new model loader.
		console.error(
			`Tried to migrate to version ${version} which is not supported by the current ModelLoader`,
		);
	});

	// This would be a good point to trigger normal upgrade logic - we're fully set up for migration, can inspect the
	// model, and haven't rendered yet.  We could even migrate multiple times if necessary (e.g. if daisy-chaining is
	// required).  E.g. something like:
	// let versionToPropose: string;
	// while (versionToPropose = await getMigrationTargetFromSomeService(model.version)) {
	//     model.proposeVersion(versionToPropose);
	//     await new Promise<void>((resolve) => {
	//         migrator.once("migrated", resolve);
	//     });
	// }
	// In this demo however, we trigger the proposal through the debug buttons.

	render(model);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
