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
	BlobCollectionContainerRuntimeFactory,
	type IBlobCollection,
} from "./container/index.js";
import { BlobCollectionView, DebugView } from "./view.js";

const urlResolver = createInsecureTinyliciousTestUrlResolver();
const tokenProvider = createInsecureTinyliciousTestTokenProvider();
const documentServiceFactory = createRouterliciousDocumentServiceFactory(tokenProvider);
const codeLoader: ICodeDetailsLoader = {
	load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
		return {
			module: { fluidExport: new BlobCollectionContainerRuntimeFactory() },
			details,
		};
	},
};

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
		container
			.attach(createTinyliciousTestCreateNewRequest())
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
	const id = location.hash.slice(1);
	container = await loadExistingContainer({
		request: { url: id },
		urlResolver,
		documentServiceFactory,
		codeLoader,
	});
	// Update url and tab title
	location.hash = id;
	document.title = id;
}

const blobCollection = (await container.getEntryPoint()) as IBlobCollection;

// Render view
const debugDiv = document.querySelector("#debug") as HTMLDivElement;
const debugRoot = createRoot(debugDiv);
debugRoot.render(createElement(DebugView, { attach }));

const appDiv = document.querySelector("#app") as HTMLDivElement;
const appRoot = createRoot(appDiv);
appRoot.render(createElement(BlobCollectionView, { blobCollection }));
