/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

import {
	BlobCollectionContainerRuntimeFactory,
	type IBlobCollection,
} from "../src/container/index.js";
import { BlobCollectionView, DebugView } from "../src/view.js";

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
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
async function createContainerAndRenderInElement(element: HTMLDivElement): Promise<void> {
	let container: IContainer;
	let attach: (() => void) | undefined;

	if (location.hash.length === 0) {
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
		attach = () => {
			const documentId = crypto.randomUUID();
			container
				.attach(createLocalResolverCreateNewRequest(documentId))
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
			request: { url: `${window.location.origin}/${id}` },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
		// Update url and tab title
		location.hash = id;
		document.title = id;
	}

	const blobCollection = (await container.getEntryPoint()) as IBlobCollection;
	const render = (blobCollection: IBlobCollection) => {
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
