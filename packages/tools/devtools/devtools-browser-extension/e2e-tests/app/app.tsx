/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import {
	type ContainerKey,
	createDevtoolsLogger,
	initializeDevtools,
} from "@fluid-experimental/devtools-core";
import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";

import { CollaborativeTextContainerRuntimeFactory, ICollaborativeTextAppModel } from "./container";

// Initialize the Devtools logger
const logger = createDevtoolsLogger();

// Initialize Devtools
const devtools = initializeDevtools({ logger });

// Render the text area in the DOM
createContainerAndRenderInElement().then((fluidContainer) => {
	// Register the container with Devtools
	registerContainerWithDevtools(fluidContainer, "e2e-test-container");
});

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function createContainerAndRenderInElement(): Promise<ICollaborativeTextAppModel> {
	const sessionStorageModelLoader = new SessionStorageModelLoader<ICollaborativeTextAppModel>(
		new StaticCodeLoader(new CollaborativeTextContainerRuntimeFactory()),
		logger,
	);

	let id: string;
	let model: ICollaborativeTextAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await sessionStorageModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await sessionStorageModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	// Render it
	ReactDOM.render(
		<React.StrictMode>
			<div className="text-area" id="text-area-id">
				<CollaborativeTextArea
					sharedStringHelper={new SharedStringHelper(model.collaborativeText.text)}
				/>
			</div>
		</React.StrictMode>,
		document.querySelector("#content"),
		() => {
			console.log("App rendered!");
		},
	);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;

	return model;
}

/**
 * Registers the provided {@link IFluidContainer} with the devtools.
 */
function registerContainerWithDevtools(
	model: ICollaborativeTextAppModel,
	containerKey: ContainerKey,
): void {
	devtools.registerContainerDevtools({
		container: model.container,
		containerKey,
		containerData: model.collaborativeText.initialObjects,
	});
}
