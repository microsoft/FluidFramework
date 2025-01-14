/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IFluidModuleWithDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import { Loader } from "@fluidframework/container-loader/legacy";
// eslint-disable-next-line import/no-internal-modules -- #26986: `fluid-static` internal used in examples
import { createDOProviderContainerRuntimeFactory } from "@fluidframework/fluid-static/internal";
// eslint-disable-next-line import/no-internal-modules -- #26987: `local-driver` internal used in examples
import { LocalSessionStorageDbFactory } from "@fluidframework/local-driver/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import type { IFluidContainer, ContainerSchema } from "fluid-framework";
import { SharedMap } from "fluid-framework/legacy";

import { DiceRollerController } from "../src/controller.js";
import { makeAppView } from "../src/view.js";

// The local server needs to be shared across the Loader instances for collaboration to happen
const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());

const urlResolver = new LocalResolver();

/**
 * Connect to the local SessionStorage Fluid service and retrieve a Container with the given ID running the given code.
 * @param containerId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 * @internal
 */
export async function getSessionStorageContainer(
	containerId: string,
	containerRuntimeFactory: IRuntimeFactory,
	createNew: boolean,
): Promise<{ container: IContainer; attach: (() => Promise<void>) | undefined }> {
	const documentServiceFactory = new LocalDocumentServiceFactory(localServer);
	const url = `${window.location.origin}/${containerId}`;

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
		attach = async (): Promise<void> => container.attach({ url });
	} else {
		container = await loader.resolve({ url });
	}

	return { container, attach };
}

const containerConfig = {
	name: "dice-roller-container",
	initialObjects: {
		/* [id]: DataObject */
		map1: SharedMap,
		map2: SharedMap,
	},
} satisfies ContainerSchema & { name: string };
type TestContainerSchema = typeof containerConfig;

async function initializeNewContainer(
	container: IFluidContainer<TestContainerSchema>,
): Promise<void> {
	// We now get the first SharedMap from the container
	const sharedMap1 = container.initialObjects.map1;
	const sharedMap2 = container.initialObjects.map2;
	await Promise.all([
		DiceRollerController.initializeModel(sharedMap1),
		DiceRollerController.initializeModel(sharedMap2),
	]);
}

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function createContainerAndRenderInElement(
	containerId: string,
	element: HTMLDivElement,
	createNewFlag: boolean,
): Promise<void> {
	// The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
	// to store ops.
	const { container, attach } = await getSessionStorageContainer(
		containerId,
		createDOProviderContainerRuntimeFactory({
			schema: containerConfig,
			compatibilityMode: "2",
		}),
		createNewFlag,
	);

	// Get the Default Object from the Container
	const fluidContainer =
		(await container.getEntryPoint()) as IFluidContainer<TestContainerSchema>;
	if (createNewFlag) {
		await initializeNewContainer(fluidContainer);
		await attach?.();
	}

	const sharedMap1 = fluidContainer.initialObjects.map1;
	const sharedMap2 = fluidContainer.initialObjects.map2;
	const diceRollerController = new DiceRollerController(sharedMap1, () => {});
	const diceRollerController2 = new DiceRollerController(sharedMap2, () => {});

	element.append(makeAppView([diceRollerController, diceRollerController2]));
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup(): Promise<void> {
	// Since this is a single page Fluid application we are generating a new document id
	// if one was not provided
	const createNew = window.location.hash.length === 0;
	if (createNew) {
		window.location.hash = Date.now().toString();
	}
	const containerId = window.location.hash.substring(1);

	const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
	if (leftElement === undefined) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(containerId, leftElement, createNew);
	const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
	if (rightElement === undefined) {
		throw new Error("sbs-right does not exist");
	}
	// The second time we don't need to createNew because we know a Container exists.
	await createContainerAndRenderInElement(containerId, rightElement, false);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

try {
	await setup();
} catch (error) {
	console.error(error);
	console.log(
		"%cThere were issues setting up and starting the in memory FLuid Server",
		"font-size:30px",
	);
}
