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
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

import {
	BlobCollectionContainerRuntimeFactory,
	type IBlobCollection,
} from "./container/index.js";
import { BlobCollectionView, DebugView } from "./view.js";

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

const doAttach = async (): Promise<void> => {
	// Some services support or require specifying the container id at attach time (local, odsp). For
	// services that do not (t9s), the passed id will be ignored.
	let id = Date.now().toString();
	const createNewRequest = createCreateNewRequest(id);
	await container.attach(createNewRequest);
	// For most services, the id on the resolvedUrl is the authoritative source for the container id
	// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
	// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
	// we retain the id we generated above.
	if (service !== "odsp") {
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url unexpectedly missing!");
		}
		id = container.resolvedUrl.id;
	}
	// Update url and tab title
	location.hash = id;
	document.title = id;
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
	// This function is synchronous since it is intended to be called in response to an event - we need to be
	// locally responsible for the handling of any async errors.
	attach = () => {
		doAttach().catch(console.error);
	};
} else {
	const id = location.hash.slice(1);
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

// Render view
const debugDiv = document.querySelector("#debug") as HTMLDivElement;
const debugRoot = createRoot(debugDiv);
debugRoot.render(createElement(DebugView, { attach }));

const appDiv = document.querySelector("#app") as HTMLDivElement;
const appRoot = createRoot(appDiv);
appRoot.render(createElement(BlobCollectionView, { blobCollection }));
