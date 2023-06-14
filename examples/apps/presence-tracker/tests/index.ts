/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */
import { Signaler } from "@fluid-experimental/data-objects";
import { IFluidContainer, ContainerSchema } from "fluid-framework";
import {
	TinyliciousClient,
	TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";
import { FocusTracker } from "../src/FocusTracker";
import { MouseTracker } from "../src/MouseTracker";
import { renderFocusPresence, renderMousePresence } from "../src/app";

const containerSchema: ContainerSchema = {
	initialObjects: {
		/* [id]: DataObject */
		signaler: Signaler,
	},
};

async function setup() {
	// Get or create the document depending if we are running through the create new flow
	const client = new TinyliciousClient();
	let container: IFluidContainer;
	let services: TinyliciousContainerServices;
	let containerId: string;

	// Get or create the document depending if we are running through the create new flow
	const createNew = !location.hash;
	if (createNew) {
		// The client will create a new container using the schema
		({ container, services } = await client.createContainer(containerSchema));
		containerId = await container.attach();
		// The new container has its own unique ID that can be used to access it in another session
		location.hash = containerId;
	} else {
		containerId = location.hash.substring(1);
		// Use the unique container ID to fetch the container created earlier
		({ container, services } = await client.getContainer(containerId, containerSchema));
	}

	// create/get container API returns a combination of the container and associated container services
	document.title = containerId;

	// Render page focus information for audience members
	const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
	const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;
	const focusTracker = new FocusTracker(
		container,
		services.audience,
		container.initialObjects.signaler as Signaler,
	);
	const mouseTracker = new MouseTracker(
		services.audience,
		container.initialObjects.signaler as Signaler,
	);
	renderFocusPresence(focusTracker, contentDiv);
	renderMousePresence(mouseTracker, focusTracker, mouseContentDiv);
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
