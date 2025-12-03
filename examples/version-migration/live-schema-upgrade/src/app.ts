/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelLoader } from "@fluid-example/example-utils";
import { assert } from "@fluidframework/core-utils/legacy";
import { createRouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/legacy";
import {
	createInsecureTinyliciousTestTokenProvider,
	createInsecureTinyliciousTestUrlResolver,
	createTinyliciousTestCreateNewRequest,
} from "@fluidframework/tinylicious-driver/test-utils";

import { DemoCodeLoader as DemoCodeLoader1 } from "./demoCodeLoader1.js";
import { DemoCodeLoader as DemoCodeLoader2 } from "./demoCodeLoader2.js";
import { IDiceRollerAppModel } from "./interfaces.js";
import { renderDiceRoller } from "./view.js";

/**
 * Get the latest version of the model.
 *
 * @remarks This is made async to mimic a call to a server to get the latest version.
 */
export async function getLatestVersion(): Promise<string> {
	// For this example, we will simulate the app updating to a new version between the first and second load. To do
	// so, the first time the app is loaded, we will consider the latest available version to be "1.0". The second
	// time a container is loaded, we will consider the latest available version to be "2.0".
	return location.hash.length === 0 ? "1.0" : "2.0";
}

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const modelVersion = await getLatestVersion();
	console.log("Starting app with model version", modelVersion);

	const modelLoader = new ModelLoader<IDiceRollerAppModel>({
		urlResolver: createInsecureTinyliciousTestUrlResolver(),
		documentServiceFactory: createRouterliciousDocumentServiceFactory(
			createInsecureTinyliciousTestTokenProvider(),
		),
		codeLoader: modelVersion === "1.0" ? new DemoCodeLoader1() : new DemoCodeLoader2(),
		generateCreateNewRequest: createTinyliciousTestCreateNewRequest,
	});

	let id: string;
	let model: IDiceRollerAppModel;

	if (modelVersion === "1.0") {
		// In this example, if modelVersion is 1.0 then we are creating a new container. We will create it using the
		// 1.0 container schema, which does not have the DiceCounter data object.
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		// In this example, if modelVersion is not 1.0 then we will be loading an existing container. This container
		// may or may not be using using the 1.0 container schema, so we will check the version of the container below
		// and upgrade the model if necessary.
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
		assert(
			model.upgrade !== undefined && model.getCurrentVersion !== undefined,
			"model should have upgrade and getCurrentVersion",
		);
		// If the model version is not the latest version, upgrade the container.
		if (model.getCurrentVersion() !== modelVersion) {
			await model.upgrade(modelVersion);
		}
	}

	// Update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("content") as HTMLDivElement;
	renderDiceRoller(model, contentDiv);
}

start().catch((error) => console.error(error));
