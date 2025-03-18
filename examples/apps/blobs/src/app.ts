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

// To allow blob creation while the container is detached, we need the container to provide
// us with memory blob storage.  This is currently controlled by a feature flag which we
// can control by setting this value in sessionStorage.
sessionStorage.setItem("Fluid.Container.MemoryBlobStorageEnabled", "true");

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
	const id = location.hash.substring(1);
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
const appDiv = document.getElementById("app") as HTMLDivElement;
const appRoot = createRoot(appDiv);
appRoot.render(createElement(BlobCollectionView, { blobCollection }));

const debugDiv = document.getElementById("debug") as HTMLDivElement;
const debugRoot = createRoot(debugDiv);
debugRoot.render(createElement(DebugView, { attach }));
