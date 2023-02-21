/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelLoader } from "@fluid-example/example-utils";
import {
	createTinyliciousCreateNewRequest,
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { assert } from "@fluidframework/common-utils";

import {
	renderDiceRoller as renderDiceRoller1,
	DemoCodeLoader as DemoCodeLoader1,
} from "./modelVersion1";
import {
	renderDiceRoller as renderDiceRoller2,
	DemoCodeLoader as DemoCodeLoader2,
} from "./modelVersion2";
import { IDiceRollerAppModel } from "./interfaces";

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
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		),
		codeLoader: modelVersion === "1.0" ? new DemoCodeLoader1() : new DemoCodeLoader2(),
		generateCreateNewRequest: createTinyliciousCreateNewRequest,
	});

	let id: string;
	let model: IDiceRollerAppModel;

	if (modelVersion === "1.0") {
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
		assert(
			model.upgrade !== undefined && model.getCurrentVersion !== undefined,
			"model should have upgrade and getCurrentVersion",
		);
		// If the model version is not the latest version, upgrade the container.
		if (model.getCurrentVersion() !== modelVersion) {
			await model.upgrade();
		}
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("content") as HTMLDivElement;
	if (modelVersion === "1.0") {
		renderDiceRoller1(model.diceRoller, contentDiv);
	} else {
		assert(model.diceCounter !== undefined, "model should have a diceCounter");
		renderDiceRoller2(model.diceRoller, model.diceCounter, contentDiv);
	}
}

start().catch((error) => console.error(error));
