/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceManager,
} from "@fluid-experimental/presence";
import {
	AzureClient,
	type AzureContainerServices,
	type AzureLocalConnectionConfig,
} from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import type { ContainerSchema, IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules
import { SharedMap } from "fluid-framework/legacy";

import { FocusTracker } from "../src/FocusTracker.js";
import { MouseTracker } from "../src/MouseTracker.js";
import { renderFocusPresence, renderMousePresence } from "../src/view.js";

const user = {
	id: "1234567890",
	name: "Test User",
};

const connectionConfig: AzureLocalConnectionConfig = {
	type: "local",
	tokenProvider: new InsecureTokenProvider("unused", user),
	endpoint: "http://localhost:7070",
};

const clientProps = {
	connection: connectionConfig,
};

const containerSchema = {
	initialObjects: {
		map1: SharedMap,
		// A Presence Manager object temporarily needs to be placed within container schema
		// https://github.com/microsoft/FluidFramework/blob/main/packages/framework/presence/README.md#onboarding
		presence: ExperimentalPresenceManager,
	},
} satisfies ContainerSchema;

export type PresenceTrackerSchema = typeof containerSchema;

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function setup() {
	const client = new AzureClient(clientProps);
	let container: IFluidContainer<PresenceTrackerSchema>;
	let services: AzureContainerServices;

	let id: string;

	const createNew = location.hash.length === 0;
	if (createNew) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container, services } = await client.createContainer(containerSchema, "2"));

		// If the app is in a `createNew` state, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		id = await container.attach();
		// The newly attached container is given a unique ID that can be used to access the container in another session
		location.hash = id;
	} else {
		id = location.hash.slice(1);
		// Use the unique container ID to fetch the container created earlier.  It will already be connected to the
		// collaboration session.
		({ container, services } = await client.getContainer(id, containerSchema, "2"));
	}

	document.title = id;

	const presence = acquirePresenceViaDataObject(container.initialObjects.presence);
	const appPresence = presence.getStates("name:trackerData", {});

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
	const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;

	const focusTracker = new FocusTracker(presence, appPresence, services.audience);
	const mouseTracker = new MouseTracker(presence, appPresence, services.audience);

	renderFocusPresence(focusTracker, contentDiv);
	renderMousePresence(mouseTracker, focusTracker, mouseContentDiv);

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
