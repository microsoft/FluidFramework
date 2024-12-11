/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IMigrator,
	IMigratorEntryPoint,
	ImportDataCallback,
	SeparateContainerMigrationResult,
} from "@fluid-example/migration-tools/internal";
import {
	makeCreateDetachedContainerCallback,
	makeSeparateContainerMigrationCallback,
} from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	type ILoaderProps,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
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

const loaderProps: ILoaderProps = {
	urlResolver: new InsecureTinyliciousUrlResolver(),
	documentServiceFactory: new RouterliciousDocumentServiceFactory(
		new InsecureTinyliciousTokenProvider(),
	),
	codeLoader: new DemoCodeLoader(),
};

const createDetachedCallback = makeCreateDetachedContainerCallback(
	loaderProps,
	createTinyliciousCreateNewRequest,
);

const importDataCallback: ImportDataCallback = async (
	destinationContainer: IContainer,
	exportedData: unknown,
) => {
	const destinationModel = await getModelFromContainer<IMigratableModel>(destinationContainer);
	// If the migrated model already supports the data format, go ahead with the migration.
	// Otherwise, try using the dataTransformationCallback if provided to get the exported data into
	// a format that we can import.
	// TODO: Error paths in case the format isn't ingestible.
	const transformedData = destinationModel.supportsDataFormat(exportedData)
		? exportedData
		: await inventoryListDataTransformationCallback(exportedData, destinationModel.version);
	await destinationModel.importData(transformedData);
};
const migrationCallback = makeSeparateContainerMigrationCallback(
	createDetachedCallback,
	importDataCallback,
);

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
	const container =
		alreadyLoadedContainer ??
		(await loadExistingContainer({ ...loaderProps, request: { url: id } }));
	const model = await getModelFromContainer<IMigratableModel>(container);

	// In this example, our container code mixes in an IMigratorEntryPoint to the container entryPoint.  The getMigrator
	// function lets us construct an IMigrator by providing the necessary external tools it needs to operate.  The IMigrator
	// is an object we can use to watch migration status, propose a migration, and discover the migration result.
	const { getMigrator } = (await container.getEntryPoint()) as IMigratorEntryPoint;
	const migrator: IMigrator = await getMigrator(
		// Note that the LoadSourceContainerCallback must load a new instance of the container.  We cannot simply return the
		// container reference we already got above since it may contain local un-ack'd changes.
		async () => loadExistingContainer({ ...loaderProps, request: { url: id } }),
		migrationCallback,
	);
	migrator.events.on("migrated", () => {
		const newContainerId = migrator.migrationResult as SeparateContainerMigrationResult;
		container.dispose();
		setupContainer(newContainerId).catch(console.error);
	});

	renderModel(model, migrator);
	updateTabForId(id);
};

async function start(): Promise<void> {
	let id: string;
	let container: IContainer | undefined;

	if (location.hash.length === 0) {
		// Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
		// Normally we would create with the most-recent version.
		const createDetachedResult = await createDetachedCallback("one");
		container = createDetachedResult.container;
		id = await createDetachedResult.attach();
	} else {
		id = location.hash.slice(1);
	}

	await setupContainer(id, container);
}

await start();
