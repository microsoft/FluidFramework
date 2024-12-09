/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IMigrator,
	IMigratorEntryPoint,
	ImportDataCallback,
} from "@fluid-example/migration-tools/internal";
import {
	makeCreateDetachedCallback,
	makeMigrationCallback,
} from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
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
import type { IMigratableModel, IVersionedModel } from "./migratableModel.js";
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

const loader = new Loader({
	urlResolver: new InsecureTinyliciousUrlResolver(),
	documentServiceFactory: new RouterliciousDocumentServiceFactory(
		new InsecureTinyliciousTokenProvider(),
	),
	codeLoader: new DemoCodeLoader(),
});

const createDetachedCallback = makeCreateDetachedCallback(
	loader,
	createTinyliciousCreateNewRequest,
);

const importDataCallback: ImportDataCallback = async (
	destinationContainer: IContainer,
	exportedData: unknown,
) => {
	const destinationModel = await getModelFromContainer<IMigratableModel>(destinationContainer);
	// TODO: Is there a reasonable way to validate at proposal time whether we'll be able to get the
	// exported data into a format that the new model can import?  If we can determine it early, then
	// clients with old MigratableModelLoaders can use that opportunity to dispose early and try to get new
	// MigratableModelLoaders.
	// TODO: Error paths in case the format isn't ingestible.
	// If the migrated model already supports the data format, go ahead with the migration.
	// Otherwise, try using the dataTransformationCallback if provided to get the exported data into
	// a format that we can import.
	const transformedData = destinationModel.supportsDataFormat(exportedData)
		? exportedData
		: await inventoryListDataTransformationCallback(exportedData, destinationModel.version);
	await destinationModel.importData(transformedData);
};
const migrationCallback = makeMigrationCallback(createDetachedCallback, importDataCallback);

/**
 * Helper function for casting the container's entrypoint to the expected type.  Does a little extra
 * type checking for added safety.
 */
const getModelFromContainer = async <ModelType>(container: IContainer): Promise<ModelType> => {
	const entryPoint = (await container.getEntryPoint()) as {
		model: ModelType;
	};

	// If the user tries to use this with an incompatible container runtime, we want to give them
	// a comprehensible error message.  So distrust the type by default and do some basic type checking.
	if (typeof entryPoint.model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}

	return entryPoint.model;
};

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

export const setupContainer = async (
	id: string,
	alreadyLoadedContainer?: IContainer | undefined,
): Promise<void> => {
	// The first createDetached flow ends up with a live container reference that we want to retain rather
	// than disposing it and loading a second time.  In all other cases we'll do the actual load here.
	const container = alreadyLoadedContainer ?? (await loader.resolve({ url: id }));
	const model = await getModelFromContainer<IMigratableModel>(container);

	// TODO: Update stale documentation
	// The Migrator takes the starting state (model and id) and watches for a migration proposal.  It encapsulates
	// the migration logic and just lets us know when a new model is loaded and available (with the "migrated" event).
	// It also takes a dataTransformationCallback to help in transforming data export format to be compatible for
	// import with newly created models.
	// TODO: Comment on casting
	const { getMigrator } = (await container.getEntryPoint()) as IMigratorEntryPoint;
	const migrator: IMigrator = await getMigrator(
		async () => loader.resolve({ url: id }),
		migrationCallback,
	);
	migrator.events.on("migrated", () => {
		const newContainerId = migrator.migrationResult as string;
		container.dispose();
		// TODO: Better error handling?
		setupContainer(newContainerId).catch(console.error);
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

	renderModel(model, migrator);
	updateTabForId(id);
};

async function start(): Promise<void> {
	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createDetachedResult = await createDetachedCallback("one");
		container = createDetachedResult.container;
		id = await createDetachedResult.attach();
	} else {
		id = location.hash.slice(1);
		container = await loader.resolve({ url: id });
	}

	await setupContainer(id, container);
}

await start();
