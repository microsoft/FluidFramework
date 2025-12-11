/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidMountableViewEntryPoint } from "@fluid-example/example-utils";
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
// eslint-disable-next-line import-x/no-internal-modules -- #26987: `local-driver` internal LocalSessionStorageDbFactory used in examples
import { LocalSessionStorageDbFactory } from "@fluidframework/local-driver/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { v4 as uuid } from "uuid";

import { fluidExport } from "../src/container/index.js";

const urlResolver = new LocalResolver();
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
const codeLoader: ICodeDetailsLoader = {
	load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
		return {
			module: { fluidExport },
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
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: { url: `${window.location.origin}/${id}` },
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader,
		});
	}

	// This example uses an older style of view integration (container-views) which is no longer recommended.
	// Prefer the external-views pattern instead (examples/view-integration/external-views).
	const { getMountableDefaultView } =
		(await container.getEntryPoint()) as IFluidMountableViewEntryPoint;
	const mountableView = await getMountableDefaultView();

	// Render view
	mountableView.mount(element);

	// Update url and tab title
	location.hash = id;
	document.title = id;
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
