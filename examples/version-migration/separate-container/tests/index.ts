/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IMigrator,
	makeCreateDetachedContainerCallback,
	makeSeparateContainerMigrationCallback,
	type SeparateContainerMigrationResult,
} from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
	LocalSessionStorageDbFactory,
} from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { inventoryListDataTransformationCallback } from "../src/dataTransform.js";
import { DemoCodeLoader } from "../src/demoCodeLoader.js";
import type { IMigratableModel, IVersionedModel } from "../src/migratableModel.js";
import type { IInventoryListAppModel } from "../src/modelInterfaces.js";
import { DebugView, InventoryListAppView } from "../src/view/index.js";

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());

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

// Store the top-level containers on the window so our tests can more easily observe the migration happening
// eslint-disable-next-line @typescript-eslint/dot-notation
window["containers"] = [];
// Store the migrators on the window so our tests can more easily observe the migration happening
// eslint-disable-next-line @typescript-eslint/dot-notation
window["migrators"] = [];

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

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
	const searchParams = new URLSearchParams(location.search);
	const testMode = searchParams.get("testMode") !== null;
	const loaderProps: ILoaderProps = {
		urlResolver,
		documentServiceFactory: new LocalDocumentServiceFactory(localServer),
		codeLoader: new DemoCodeLoader(testMode),
	};

	const createDetachedCallback = makeCreateDetachedContainerCallback(loaderProps, () =>
		createLocalResolverCreateNewRequest(uuid()),
	);

	let id: string;
	let container: IContainer;
	let model: IMigratableModel;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createDetachedResult = await createDetachedCallback("one");
		container = createDetachedResult.container;
		model = await getModelFromContainer<IMigratableModel>(container);
		id = await createDetachedResult.attach();
	} else {
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			...loaderProps,
			request: { url: `${window.location.origin}/${id}` },
		});
		model = await getModelFromContainer<IMigratableModel>(container);
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	let appRoot: Root | undefined;
	let debugRoot: Root | undefined;

	const render = (model: IVersionedModel, migrator: IMigrator) => {
		// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
		// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
		// view code loader to pull in the view dynamically based on the version we discover.
		if (isIInventoryListAppModel(model)) {
			if (appRoot !== undefined) {
				appRoot.unmount();
			}
			appRoot = createRoot(appDiv);
			appRoot.render(createElement(InventoryListAppView, { model, migrator }));

			// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
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

	const importDataCallback = async (
		destinationContainer: IContainer,
		exportedData: unknown,
	) => {
		const destinationModel =
			await getModelFromContainer<IMigratableModel>(destinationContainer);
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

	const migrationCallback = makeSeparateContainerMigrationCallback(
		createDetachedCallback,
		importDataCallback,
	);

	const entryPoint = await container.getEntryPoint();
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
	const migrator: IMigrator = await (entryPoint as any).getMigrator(
		async () =>
			loadExistingContainer({
				...loaderProps,
				request: { url: `${window.location.origin}/${id}` },
			}),
		migrationCallback,
	);
	migrator.events.on("migrated", () => {
		container.dispose();
		// TODO: Load new container
		render(model, migrator);
		updateTabForId(migrator.migrationResult as SeparateContainerMigrationResult);
	});

	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["containers"].push(container);
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["migrators"].push(migrator);

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(model, migrator);

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
