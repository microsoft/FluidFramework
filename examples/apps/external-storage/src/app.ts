/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { DownloadableViewContainerRuntimeFactory } from "./container";
import { CollaborativeView } from "./view";
import { RootDataObject } from "./fluid-object";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
	const tinyliciousModelLoader = new TinyliciousModelLoader<RootDataObject>(
		new StaticCodeLoader(new DownloadableViewContainerRuntimeFactory()),
	);

	let id: string;
	let model: RootDataObject;

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

	// Render it
	const contentDiv = document.getElementById("content");
	if (contentDiv !== null) {
		ReactDOM.render(React.createElement(CollaborativeView, { model }), contentDiv);
	}
}

start().catch((e) => {
	console.error(e);
	console.log(
		"%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
		"font-size:30px",
	);
});
