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
	BlobCollectionContainerRuntimeFactory,
	type IBlobCollection,
} from "../src/container/index.js";
import { BlobCollectionView, DebugView } from "../src/view.js";

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
			module: { fluidExport: new BlobCollectionContainerRuntimeFactory() },
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
	let container: IContainer;
	let attach: (() => void) | undefined;

	if (location.hash.length === 0) {
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		attach = () => {
			const documentId = uuid();
			container
				.attach(createCreateNewRequest(documentId))
				.then(() => {
					if (container.resolvedUrl === undefined) {
						throw new Error("Resolved Url unexpectedly missing!");
					}
					const id = container.resolvedUrl.id;
					// Update url and tab title
					location.hash = id;
					document.title = id;
				})
				.catch(console.error);
		};
	} else {
		const id = location.hash.substring(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		// Update url and tab title
		location.hash = id;
		document.title = id;
	}

	const blobCollection = (await container.getEntryPoint()) as IBlobCollection;
	const render = (blobCollection: IBlobCollection): void => {
		const appElement = document.createElement("div");
		const debugElement = document.createElement("div");
		element.append(debugElement, appElement);

		const debugRoot = createRoot(debugElement);
		debugRoot.render(createElement(DebugView, { attach }));

		const appRoot = createRoot(appElement);
		appRoot.render(createElement(BlobCollectionView, { blobCollection }));
	};

	// Render it
	render(blobCollection);
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
