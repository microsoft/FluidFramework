/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import type {
	ICodeDetailsLoader,
	IContainer,
	IFluidCodeDetails,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/legacy";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuid } from "uuid";

import {
	DiceRollerContainerRuntimeFactory,
	type IDiceRoller,
} from "../src/container/index.js";
import { DiceRollerView } from "../src/view.js";

const service = getSpecifiedServiceFromWebpack();
const {
	urlResolver,
	documentServiceFactory,
	createCreateNewRequest,
	createLoadExistingRequest,
} = await createExampleDriver(service);
const codeLoader: ICodeDetailsLoader = {
	load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
		return {
			module: { fluidExport: new DiceRollerContainerRuntimeFactory() },
			details,
		};
	},
};

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function createOrLoadContainerAndRenderInElement(
	element: HTMLDivElement,
): Promise<void> {
	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		const documentId = uuid();
		await container.attach(createCreateNewRequest(documentId));
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url not available on attached container");
		}
		// Should be the same as the uuid we generated above.
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	const diceRoller = (await container.getEntryPoint()) as IDiceRoller;
	const render = (diceRoller: IDiceRoller) => {
		const appRoot = createRoot(element);
		appRoot.render(createElement(DiceRollerView, { diceRoller }));
	};

	// Update url and tab title
	location.hash = id;
	document.title = id;
	// Render it
	render(diceRoller);
}

const leftElement = document.querySelector("#sbs-left") as HTMLDivElement;
if (leftElement === null) {
	throw new Error("sbs-left does not exist");
}
await createOrLoadContainerAndRenderInElement(leftElement);
const rightElement = document.querySelector("#sbs-right") as HTMLDivElement;
if (rightElement === null) {
	throw new Error("sbs-right does not exist");
}
await createOrLoadContainerAndRenderInElement(rightElement);

// Setting "fluidStarted" is just for our test automation
// eslint-disable-next-line @typescript-eslint/dot-notation
window["fluidStarted"] = true;
