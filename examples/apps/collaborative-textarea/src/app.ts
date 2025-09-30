/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import {
	CollaborativeTextContainerRuntimeFactory,
	type ICollaborativeTextAppModel,
} from "./container.js";
import { CollaborativeTextView } from "./view.js";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start(): Promise<void> {
	const tinyliciousModelLoader = new TinyliciousModelLoader<ICollaborativeTextAppModel>(
		new StaticCodeLoader(new CollaborativeTextContainerRuntimeFactory()),
	);

	let id: string;
	let model: ICollaborativeTextAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.slice(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	// eslint-disable-next-line require-atomic-updates
	location.hash = id;
	document.title = id;

	// Render it
	const contentDiv = document.querySelector("#content");
	if (contentDiv !== null) {
		ReactDOM.render(
			React.createElement(CollaborativeTextView, { text: model.collaborativeText.text }),
			contentDiv,
		);
	}
}

try {
	await start();
} catch (error) {
	console.error(error);
	console.log(
		"%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
		"font-size:30px",
	);
}
