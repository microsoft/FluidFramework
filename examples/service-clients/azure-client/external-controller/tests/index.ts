/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */
import { SharedMap, type ISharedMap } from "fluid-framework";

import {
	IContainer,
	IFluidModuleWithDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	LocalSessionStorageDbFactory,
} from "@fluidframework/local-driver";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { DiceRollerController } from "../src/controller.js";
import { makeAppView } from "../src/view.js";
import {
	IFluidContainer,
	createDOProviderContainerRuntimeFactory,
} from "@fluidframework/fluid-static";

// Since this is a single page Fluid application we are generating a new document id
// if one was not provided
let createNew = false;
if (window.location.hash.length === 0) {
	createNew = true;
	window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

// The local server needs to be shared across the Loader instances for collaboration to happen
const localServerMap = new Map<string, ILocalDeltaConnectionServer>();

const urlResolver = new LocalResolver();

/**
 * Connect to the local SessionStorage Fluid service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 * @internal
 */
export async function getSessionStorageContainer(
	documentId: string,
	containerRuntimeFactory: IRuntimeFactory,
	createNew: boolean,
): Promise<{ container: IContainer; attach: (() => Promise<void>) | undefined }> {
	let localServer = localServerMap.get(documentId);
	if (localServer === undefined) {
		localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
		localServerMap.set(documentId, localServer);
	}

	const documentServiceFactory = new LocalDocumentServiceFactory(localServer);
	const url = `${window.location.origin}/${documentId}`;

	// To bypass proposal-based loading, we need a codeLoader that will return our already-in-memory container factory.
	// The expected format of that response is an IFluidModule with a fluidExport.
	const load = async (): Promise<IFluidModuleWithDetails> => {
		return {
			module: { fluidExport: containerRuntimeFactory },
			details: { package: "no-dynamic-package", config: {} },
		};
	};

	const codeLoader = { load };

	const loader = new Loader({
		urlResolver,
		documentServiceFactory,
		codeLoader,
	});

	let container: IContainer;
	let attach: (() => Promise<void>) | undefined;

	if (createNew) {
		// We're not actually using the code proposal (our code loader always loads the same module regardless of the
		// proposal), but the IContainer will only give us a NullRuntime if there's no proposal.  So we'll use a fake
		// proposal.
		container = await loader.createDetachedContainer({ package: "", config: {} });
		attach = async () => container.attach({ url });
	} else {
		container = await loader.resolve({ url });
	}

	return { container, attach };
}

/**
 * @internal
 */
export const containerConfig = {
	name: "dice-roller-container",
	initialObjects: {
		/* [id]: DataObject */
		map1: SharedMap,
		map2: SharedMap,
	},
};

async function initializeNewContainer(container: IFluidContainer): Promise<void> {
	// We now get the first SharedMap from the container
	const sharedMap1 = container.initialObjects.map1 as ISharedMap;
	const sharedMap2 = container.initialObjects.map2 as ISharedMap;
	await Promise.all([
		DiceRollerController.initializeModel(sharedMap1),
		DiceRollerController.initializeModel(sharedMap2),
	]);
}

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 * @internal
 */
export async function createContainerAndRenderInElement(
	element: HTMLDivElement,
	createNewFlag: boolean,
) {
	// The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
	// to store ops.
	const { container, attach } = await getSessionStorageContainer(
		documentId,
		createDOProviderContainerRuntimeFactory({ schema: containerConfig }),
		createNewFlag,
	);

	// Get the Default Object from the Container
	const fluidContainer = (await container.getEntryPoint()) as IFluidContainer;
	if (createNewFlag) {
		await initializeNewContainer(fluidContainer);
		await attach?.();
	}

	const sharedMap1 = fluidContainer.initialObjects.map1 as ISharedMap;
	const sharedMap2 = fluidContainer.initialObjects.map2 as ISharedMap;
	const diceRollerController = new DiceRollerController(sharedMap1);
	const diceRollerController2 = new DiceRollerController(sharedMap2);

	element.append(makeAppView([diceRollerController, diceRollerController2]));
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
	const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
	if (leftElement === undefined) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(leftElement, createNew);
	const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
	if (rightElement === undefined) {
		throw new Error("sbs-right does not exist");
	}
	// The second time we don't need to createNew because we know a Container exists.
	await createContainerAndRenderInElement(rightElement, false);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory FLuid Server",
		"font-size:30px",
	);
});
