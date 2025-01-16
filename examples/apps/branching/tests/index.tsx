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

import React from "react";
import ReactDOM from "react-dom";
import { v4 as uuid } from "uuid";

import { GroceryListContainerRuntimeFactory } from "../src/model/index.js";
import type { IGroceryList } from "../src/modelInterfaces.js";
import { DebugView, GroceryListView } from "../src/view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
	let id: string;
	let groceryList: IGroceryList;

	if (location.hash.length === 0) {
		const container = await createDetachedContainer({
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: new StaticCodeLoader(new GroceryListContainerRuntimeFactory()),
			codeDetails: { package: "1.0" },
		});
		groceryList = (await container.getEntryPoint()) as IGroceryList;
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
			codeLoader: new StaticCodeLoader(new GroceryListContainerRuntimeFactory()),
		});
		groceryList = (await container.getEntryPoint()) as IGroceryList;
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	const render = (groceryList: IGroceryList) => {
		ReactDOM.unmountComponentAtNode(appDiv);
		ReactDOM.render(React.createElement(GroceryListView, { groceryList }), appDiv);

		// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
		ReactDOM.unmountComponentAtNode(debugDiv);
		ReactDOM.render(
			React.createElement(DebugView, {
				groceryList,
			}),
			debugDiv,
		);
	};

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(groceryList);

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
