/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { assert } from "@fluidframework/core-utils";
import { LoadableDataObject } from "@fluid-experimental/to-non-fluid";
import { initializeIcons } from "@fluentui/react";
import {
	DownloadableRootViewContainerRuntimeFactory,
	DownloadableViewContainerRuntimeFactory,
} from "./container";
import { RootDataObject } from "./fluid-object";
import { LoadView } from "./loadView";
import { CollaborativeRootView } from "./collaborativeRootView";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
	const rootModelViewLoader = new TinyliciousModelLoader<RootDataObject>(
		new StaticCodeLoader(new DownloadableRootViewContainerRuntimeFactory()),
	);

	const specialRuntimeFactory = new DownloadableViewContainerRuntimeFactory();
	const loadableModelViewLoader = new TinyliciousModelLoader<LoadableDataObject>(
		new StaticCodeLoader(specialRuntimeFactory),
	);

	const contentDiv = document.getElementById("content");
	assert(contentDiv !== null, "should have content div!");

	initializeIcons();
	if (location.hash.length === 0) {
		ReactDOM.render(
			React.createElement(LoadView, {
				rootLoader: rootModelViewLoader,
				loadableLoader: loadableModelViewLoader,
				runtimeFactory: specialRuntimeFactory,
			}),
			contentDiv,
		);
	} else {
		const id = location.hash.substring(1);
		const model = await loadableModelViewLoader.loadExisting(id);

		// update the browser URL and the window title with the actual container ID
		location.hash = id;
		document.title = id;

		// Render collaborative view
		ReactDOM.render(React.createElement(CollaborativeRootView, { model }), contentDiv);
	}
}

start().catch((e) => {
	console.error(e);
	console.log(
		"%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
		"font-size:30px",
	);
});
