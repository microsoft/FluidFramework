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

import {
	renderDiceRoller as renderDiceRoller1,
	DemoCodeLoader as DemoCodeLoader1,
} from "./modelVersion1";
import {
	renderDiceRoller as renderDiceRoller2,
	DemoCodeLoader as DemoCodeLoader2,
} from "./modelVersion2";

import { ModelType } from "./interfaces";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const modelVersion = location.hash.length === 0 ? "1.0" : "2.0";

	console.log("Starting app with model version", modelVersion);

	const modelLoader = new ModelLoader<ModelType>({
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		),
		codeLoader: modelVersion === "1.0" ? new DemoCodeLoader1() : new DemoCodeLoader2(),
		generateCreateNewRequest: createTinyliciousCreateNewRequest,
	});

	let id: string;
	let model: any;

	if (modelVersion === "1.0") {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await modelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await modelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("content") as HTMLDivElement;
	if (modelVersion === "1.0") {
		renderDiceRoller1(model.diceRoller, contentDiv);
	} else {
		renderDiceRoller2(model.diceRoller, model.diceCounter, contentDiv);
	}
}

start().catch((error) => console.error(error));
