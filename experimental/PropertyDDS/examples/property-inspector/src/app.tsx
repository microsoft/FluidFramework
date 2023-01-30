/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { registerSchemas } from "@fluid-experimental/schemas";

import { PropertyTreeContainerRuntimeFactory, IPropertyTreeAppModel } from "./containerCode";
import { renderApp } from "./inspector";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	// Register all schemas.
	// It's important to register schemas before loading an existing document
	// in order to process the changeset.
	registerSchemas(PropertyFactory);

	const tinyliciousModelLoader = new TinyliciousModelLoader<IPropertyTreeAppModel>(
		new StaticCodeLoader(new PropertyTreeContainerRuntimeFactory()),
	);

	let id: string;
	let model: IPropertyTreeAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	renderApp(model.propertyTree.tree, document.getElementById("root")!);
}

start().catch((error) => console.error(error));
