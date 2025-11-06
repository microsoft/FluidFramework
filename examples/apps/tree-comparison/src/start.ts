/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
import { createElement } from "react";
import ReactDOM from "react-dom";

import { InventoryListContainerRuntimeFactory } from "./model/index.js";
import type { IInventoryListAppModel } from "./modelInterfaces.js";
import { DebugView, InventoryListAppView } from "./view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (model: IInventoryListAppModel) => {
	const appDiv = document.querySelector("#app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	ReactDOM.render(createElement(InventoryListAppView, { model }), appDiv);

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.querySelector("#debug") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(debugDiv);
	ReactDOM.render(
		createElement(DebugView, {
			model,
		}),
		debugDiv,
	);
};

async function start(): Promise<void> {
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new InventoryListContainerRuntimeFactory());

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
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	// Get the model from the container
	const model = (await container.getEntryPoint()) as IInventoryListAppModel;

	render(model);
	updateTabForId(id);
}

await start();
