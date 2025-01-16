/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader } from "@fluid-example/example-utils";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
import { createRouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/legacy";
import {
	createInsecureTinyliciousTestTokenProvider,
	createInsecureTinyliciousTestUrlResolver,
	createTinyliciousTestCreateNewRequest,
} from "@fluidframework/tinylicious-driver/test-utils";
import React from "react";
import ReactDOM from "react-dom";

import { GroceryListContainerRuntimeFactory } from "./model/index.js";
import type { IGroceryList } from "./modelInterfaces.js";
import { DebugView, GroceryListView } from "./view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (groceryList: IGroceryList) => {
	const appDiv = document.getElementById("app") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(appDiv);
	ReactDOM.render(React.createElement(GroceryListView, { groceryList }), appDiv);

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.getElementById("debug") as HTMLDivElement;
	ReactDOM.unmountComponentAtNode(debugDiv);
	ReactDOM.render(
		React.createElement(DebugView, {
			groceryList,
		}),
		debugDiv,
	);
};

const tokenProvider = createInsecureTinyliciousTestTokenProvider();
const urlResolver = createInsecureTinyliciousTestUrlResolver();
const documentServiceFactory = createRouterliciousDocumentServiceFactory(tokenProvider);

async function start(): Promise<void> {
	let id: string;
	let groceryList: IGroceryList;

	if (location.hash.length === 0) {
		const container = await createDetachedContainer({
			urlResolver,
			documentServiceFactory,
			codeLoader: new StaticCodeLoader(new GroceryListContainerRuntimeFactory()),
			codeDetails: { package: "1.0" },
		});
		groceryList = (await container.getEntryPoint()) as IGroceryList;
		await container.attach(createTinyliciousTestCreateNewRequest());
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url not available on attached container");
		}
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.substring(1);
		const container = await loadExistingContainer({
			request: { url: id },
			urlResolver,
			documentServiceFactory,
			codeLoader: new StaticCodeLoader(new GroceryListContainerRuntimeFactory()),
		});
		groceryList = (await container.getEntryPoint()) as IGroceryList;
	}

	render(groceryList);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
