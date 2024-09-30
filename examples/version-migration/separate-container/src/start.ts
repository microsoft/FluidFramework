/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IMigratableModel,
	IMigrationTool,
	IVersionedModel,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluid-example/migration-tools/internal";
// eslint-disable-next-line import/no-internal-modules
import { MigratableModelLoader, Migrator } from "@fluid-example/migration-tools/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver/internal";
import { createElement } from "react";
import { render, unmountComponentAtNode } from "react-dom";

import { inventoryListDataTransformationCallback } from "./dataTransform.js";
import { DemoCodeLoader } from "./demoCodeLoader.js";
import type { IInventoryListAppModel } from "./modelInterfaces.js";
import { DebugView, InventoryListAppView } from "./view/index.js";

const updateTabForId = (id: string): void => {
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

const getUrlForContainerId = (containerId: string): string => `/#${containerId}`;

const renderModel = (model: IVersionedModel, migrationTool: IMigrationTool): void => {
	const appDiv = document.querySelector("#app") as HTMLDivElement;
	unmountComponentAtNode(appDiv);
	// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
	// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
	// view code loader to pull in the view dynamically based on the version we discover.
	if (isIInventoryListAppModel(model)) {
		render(createElement(InventoryListAppView, { model, migrationTool }), appDiv);

		// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
		const debugDiv = document.querySelector("#debug") as HTMLDivElement;
		unmountComponentAtNode(debugDiv);
		render(
			createElement(DebugView, {
				model,
				migrationTool,
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
	// (unknown) container version.  So the ModelLoader would be replaced by e.g. container.getEntryPoint() or
	// container.getEntryPoint().model if we knew that was the model.
	// TODO: This is really loading an IInventoryListAppModel & IMigratableModel (we know this because of what the
	// DemoCodeLoader supports).  Should we just use that more-specific type in the typing here?
	const modelLoader = new MigratableModelLoader<IMigratableModel>({
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		),
		codeLoader: new DemoCodeLoader(),
		generateCreateNewRequest: createTinyliciousCreateNewRequest,
	});

	let id: string;
	let model: IMigratableModel;
	let migrationTool: IMigrationTool;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createResponse = await modelLoader.createDetached("one");
		model = createResponse.model;
		migrationTool = createResponse.migrationTool;
		id = await createResponse.attach();
	} else {
		id = location.hash.slice(1);
		const loadResponse = await modelLoader.loadExisting(id);
		model = loadResponse.model;
		migrationTool = loadResponse.migrationTool;
	}

	// The Migrator takes the starting state (model and id) and watches for a migration proposal.  It encapsulates
	// the migration logic and just lets us know when a new model is loaded and available (with the "migrated" event).
	// It also takes a dataTransformationCallback to help in transforming data export format to be compatible for
	// import with newly created models.
	// TODO: Consider just passing the ModelLoader (or even the model loader construction args?) and kind of wrapping it.
	// Then this becomes something like a MigratingModelLoader.  Then the model can have a migrationTool but sort of hide it.
	const migrator = new Migrator(
		modelLoader,
		model,
		migrationTool,
		id,
		inventoryListDataTransformationCallback,
	);
	migrator.events.on("migrated", () => {
		model.dispose();
		model = migrator.currentModel;
		migrationTool = migrator.currentMigrationTool;
		renderModel(model, migrationTool);
		updateTabForId(migrator.currentModelId);
	});
	// If the ModelLoader doesn't know how to load the model required for migration, it emits "migrationNotSupported".
	// For example, this might be hit if another client has a newer ModelLoader and proposes a version our
	// ModelLoader doesn't know about.
	// However, this will never be hit in this demo since we have a finite set of models to support.  If the model
	// code loader pulls in the appropriate model dynamically, this might also never be hit since all clients
	// are theoretically referencing the same model library.
	migrator.events.on("migrationNotSupported", (version: string) => {
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

	renderModel(model, migrationTool);
	updateTabForId(id);
}

await start();
