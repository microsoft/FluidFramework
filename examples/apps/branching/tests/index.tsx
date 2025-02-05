/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader } from "@fluid-example/example-utils";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
// eslint-disable-next-line import/no-internal-modules -- #26987: `local-driver` internal LocalSessionStorageDbFactory used in examples
import { LocalSessionStorageDbFactory } from "@fluidframework/local-driver/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuid } from "uuid";

import {
	GroceryListContainerRuntimeFactory,
	type GroceryListAppEntryPoint,
	type PrivateChanges,
} from "../src/container/index.js";
import type { IGroceryList } from "../src/groceryList/index.js";
import { AppView, DebugView } from "../src/view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
const codeLoader = new StaticCodeLoader(new GroceryListContainerRuntimeFactory());

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
	let id: string;
	let entryPoint: GroceryListAppEntryPoint;

	if (location.hash.length === 0) {
		const container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
		entryPoint = (await container.getEntryPoint()) as GroceryListAppEntryPoint;
		const documentId = uuid();
		await container.attach(createLocalResolverCreateNewRequest(documentId));
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url not available on attached container");
		}
		// Should be the same as the uuid we generated above.
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.substring(1);
		const container = await loadExistingContainer({
			request: { url: `${window.location.origin}/${id}` },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
		entryPoint = (await container.getEntryPoint()) as GroceryListAppEntryPoint;
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	const render = (
		groceryList: IGroceryList,
		getSuggestions: () => Promise<PrivateChanges>,
	) => {
		const appRoot = createRoot(appDiv);
		appRoot.render(createElement(AppView, { groceryList, getSuggestions }));

		// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
		const debugRoot = createRoot(debugDiv);
		debugRoot.render(createElement(DebugView, { groceryList }));
	};

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(entryPoint.groceryList, entryPoint.getSuggestions);

	element.append(appDiv, debugDiv);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
	const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
	if (leftElement === null) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(leftElement);
	const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
	if (rightElement === null) {
		throw new Error("sbs-right does not exist");
	}
	await createContainerAndRenderInElement(rightElement);
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory Fluid Server",
		"font-size:30px",
	);
});
