/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
import { createElement } from "react";
// eslint-disable-next-line import/no-internal-modules
import { createRoot } from "react-dom/client";

import {
	GroceryListContainerRuntimeFactory,
	type ISuggestionGroceryList,
} from "./container/index.js";
import { AppView, DebugView } from "./view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (groceryList: ISuggestionGroceryList) => {
	const appDiv = document.querySelector("#app") as HTMLDivElement;
	const appRoot = createRoot(appDiv);
	appRoot.render(createElement(AppView, { groceryList }));

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.querySelector("#debug") as HTMLDivElement;
	const debugRoot = createRoot(debugDiv);
	debugRoot.render(createElement(DebugView, { groceryList }));
};

async function start(): Promise<void> {
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new GroceryListContainerRuntimeFactory());

	let id: string;
	let groceryList: ISuggestionGroceryList;

	if (location.hash.length === 0) {
		// Some services support or require specifying the container id at attach time (local, odsp). For
		// services that do not (t9s), the passed id will be ignored.
		id = Date.now().toString();
		const createNewRequest = createCreateNewRequest(id);
		const container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		groceryList = (await container.getEntryPoint()) as ISuggestionGroceryList;
		await container.attach(createNewRequest);
		// For most services, the id on the resolvedUrl is the authoritative source for the container id
		// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
		// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
		// we retain the id we generated above.
		if (service !== "odsp") {
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			id = container.resolvedUrl.id;
		}
	} else {
		id = location.hash.slice(1);
		const container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		groceryList = (await container.getEntryPoint()) as ISuggestionGroceryList;
	}

	render(groceryList);
	updateTabForId(id);
}

await start();
