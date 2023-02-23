/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import { PropertyTreeContainerRuntimeFactory, IPropertyTreeAppModel } from "./containerCode";
import { renderApp, renderInspector } from "./view";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
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

	const contentDiv = document.getElementById("content") as HTMLDivElement;

	// Render the actual sample
	const dataBinder = renderApp(model.propertyTree, contentDiv);

	// Render property inspector
	renderInspector(dataBinder, model.propertyTree);
}

start().catch((error) => console.error(error));
