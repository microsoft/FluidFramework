/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IMigratableModel,
	IMigrator,
	IVersionedModel,
} from "@fluid-example/migration-tools/internal";
import {
	getModelAndMigrationToolFromContainer,
	SimpleLoader,
} from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver/internal";
import { createElement } from "react";
// eslint-disable-next-line import/no-internal-modules
import { createRoot, type Root } from "react-dom/client";

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

let appRoot: Root | undefined;
let debugRoot: Root | undefined;

const renderModel = (model: IVersionedModel, migrator: IMigrator): void => {
	// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
	// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
	// view code loader to pull in the view dynamically based on the version we discover.
	if (isIInventoryListAppModel(model)) {
		const appDiv = document.querySelector("#app") as HTMLDivElement;
		if (appRoot !== undefined) {
			appRoot.unmount();
		}
		appRoot = createRoot(appDiv);
		appRoot.render(createElement(InventoryListAppView, { model, migrator }));

		// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
		const debugDiv = document.querySelector("#debug") as HTMLDivElement;
		if (debugRoot !== undefined) {
			debugRoot.unmount();
		}
		debugRoot = createRoot(debugDiv);
		debugRoot.render(
			createElement(DebugView, {
				model,
				migrator,
				getUrlForContainerId,
			}),
		);
	} else {
		throw new Error(`Don't know how to render version ${model.version}`);
	}
};

async function start(): Promise<void> {
	const loader = new SimpleLoader({
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		),
		codeLoader: new DemoCodeLoader(),
		generateCreateNewRequest: createTinyliciousCreateNewRequest,
	});

	let id: string;
	let container: IContainer;
	let model: IMigratableModel;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createDetachedResult = await loader.createDetached("one");
		container = createDetachedResult.container;
		const modelAndMigrationTool =
			await getModelAndMigrationToolFromContainer<IMigratableModel>(container);
		model = modelAndMigrationTool.model;
		id = await createDetachedResult.attach();
	} else {
		id = location.hash.slice(1);
		container = await loader.loadExisting(id);
		const modelAndMigrationTool =
			await getModelAndMigrationToolFromContainer<IMigratableModel>(container);
		model = modelAndMigrationTool.model;
	}

	// TODO: Update stale documentation
	// The Migrator takes the starting state (model and id) and watches for a migration proposal.  It encapsulates
	// the migration logic and just lets us know when a new model is loaded and available (with the "migrated" event).
	// It also takes a dataTransformationCallback to help in transforming data export format to be compatible for
	// import with newly created models.
	const entryPoint = await container.getEntryPoint();
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
	const migrator: IMigrator = await (entryPoint as any).getMigrator(
		loader,
		id,
		container,
		inventoryListDataTransformationCallback,
	);
	migrator.events.on("migrated", () => {
		container.dispose();
		// TODO: Load new container
		renderModel(model, migrator);
		// TODO: Figure out what good casting looks like
		updateTabForId(migrator.migrationResult as string);
	});
	// If the loader doesn't know how to load the container code required for migration, it emits "migrationNotSupported".
	// For example, this might be hit if another client has a newer loader and proposes a version our
	// loader doesn't know about.
	// However, this will never be hit in this demo since we have a finite set of container codes to support.  If the
	// code loader pulls in the appropriate code dynamically, this might also never be hit since all clients
	// are theoretically referencing the same code library.
	migrator.events.on("migrationNotSupported", (version: string) => {
		// To move forward, we would need to acquire a loader capable of loading the given code, retry the
		// load, and set up a new Migrator with the new loader.
		console.error(
			`Tried to migrate to version ${version} which is not supported by the current loader`,
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

	renderModel(model, migrator);
	updateTabForId(id);
}

await start();
