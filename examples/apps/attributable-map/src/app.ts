/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import { enableOnNewFileKey } from "@fluid-experimental/attributor";
import { HitCounterContainerRuntimeFactory, IHitCounterAppModel } from "./containerCode.js";
import { renderHitCounter } from "./view.js";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	/**
	 * Manually enable the attribution config,
	 */
	sessionStorage.setItem(enableOnNewFileKey, "true");

	const tinyliciousModelLoader = new TinyliciousModelLoader<IHitCounterAppModel>(
		new StaticCodeLoader(new HitCounterContainerRuntimeFactory()),
	);

	let id: string;
	let model: IHitCounterAppModel;

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
	renderHitCounter(model.hitCounter, model.runtimeAttributor, contentDiv);
}

start().catch((error) => console.error(error));
