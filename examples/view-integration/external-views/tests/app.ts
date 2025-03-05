/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
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
	DiceRollerContainerRuntimeFactory,
	type IDiceRoller,
} from "../src/container/index.js";
import { DiceRollerView } from "../src/view.js";

const updateTabForId = (id: string): void => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
const codeLoader = new StaticCodeLoader(new DiceRollerContainerRuntimeFactory());

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function createContainerAndRenderInElement(element: HTMLDivElement): Promise<void> {
	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
		const documentId = uuid();
		await container.attach(createLocalResolverCreateNewRequest(documentId));
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url not available on attached container");
		}
		// Should be the same as the uuid we generated above.
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.substring(1);
		container = await loadExistingContainer({
			request: { url: `${window.location.origin}/${id}` },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
	}

	const diceRoller = (await container.getEntryPoint()) as IDiceRoller;
	const render = (diceRoller: IDiceRoller) => {
		const appRoot = createRoot(element);
		appRoot.render(createElement(DiceRollerView, { diceRoller }));
	};

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(diceRoller);
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup(): Promise<void> {
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

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory Fluid Server",
		"font-size:30px",
	);
});
