/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
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
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new CollaborativeTextContainerRuntimeFactory());

	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		// Some services support or require specifying the container id at attach time (local, odsp). For
		// services that do not (t9s), the passed id will be ignored.
		id = Date.now().toString();
		const createNewRequest = createCreateNewRequest(id);
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		await container.attach(createNewRequest);
		// For most services, the id on the resolvedUrl is the authoritative source for the container id
		// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
		// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
		// we retain the id we generated above.
		if (service !== "odsp") {
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url unexpectedly missing!");
			}
			id = container.resolvedUrl.id;
		}
	} else {
		id = location.hash.substring(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	// Get the model from the container
	const model = (await container.getEntryPoint()) as ICollaborativeTextAppModel;

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

await start();
