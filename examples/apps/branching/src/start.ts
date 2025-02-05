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
import { createElement } from "react";
// eslint-disable-next-line import/no-internal-modules
import { createRoot } from "react-dom/client";

import {
	GroceryListContainerRuntimeFactory,
	type GroceryListAppEntryPoint,
	type PrivateChanges,
} from "./containerCode.js";
import type { IGroceryList } from "./groceryList/index.js";
import { AppView, DebugView } from "./view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (groceryList: IGroceryList, getSuggestions: () => Promise<PrivateChanges>) => {
	const appDiv = document.getElementById("app") as HTMLDivElement;
	const appRoot = createRoot(appDiv);
	appRoot.render(createElement(AppView, { groceryList, getSuggestions }));

	// The DebugView is just for demo purposes, in case we want to access internal state or have debug controls.
	const debugDiv = document.getElementById("debug") as HTMLDivElement;
	const debugRoot = createRoot(debugDiv);
	debugRoot.render(createElement(DebugView, { groceryList }));
};

const tokenProvider = createInsecureTinyliciousTestTokenProvider();
const urlResolver = createInsecureTinyliciousTestUrlResolver();
const codeLoader = new StaticCodeLoader(new GroceryListContainerRuntimeFactory());

async function start(): Promise<void> {
	let id: string;
	let entryPoint: GroceryListAppEntryPoint;

	if (location.hash.length === 0) {
		const container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: createRouterliciousDocumentServiceFactory(tokenProvider),
			codeLoader,
		});
		entryPoint = (await container.getEntryPoint()) as GroceryListAppEntryPoint;
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
			documentServiceFactory: createRouterliciousDocumentServiceFactory(tokenProvider),
			codeLoader,
		});
		entryPoint = (await container.getEntryPoint()) as GroceryListAppEntryPoint;
	}

	render(entryPoint.groceryList, entryPoint.getSuggestions);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
