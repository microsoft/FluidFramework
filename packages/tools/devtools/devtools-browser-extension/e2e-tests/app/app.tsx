/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import {
	ContainerKey,
	DevtoolsLogger,
	IDevtools,
	initializeDevtools,
} from "@fluid-experimental/devtools";
import { IFluidContainer, ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedString } from "@fluidframework/sequence";

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
const containerSchema: ContainerSchema = {
	initialObjects: {
		rootMap: SharedMap,
	},
	dynamicObjectTypes: [SharedMap, SharedString],
};
// Initialize the Devtools logger
const logger = new DevtoolsLogger();

// Initialize the Tinylicious client
const client = new TinyliciousClient({ logger });

// Initialize Devtools
const devtools = initializeDevtools({ logger: logger });

// Initialize the CollaborativeText
const text = await getCollaborativeText(client);

// Register the container with Devtools
getContainerInfo(client).then((containerInfo) => {
	const container = containerInfo.container;
	registerContainerWithDevtools(devtools, container, "e2e-test-container");
	const rootMap = container.initialObjects.rootMap as SharedMap;
	rootMap.set("shared-text", text.handle);
});

ReactDOM.render(
	<React.StrictMode>
		<div className="text-area">
			<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(text)} />
		</div>
	</React.StrictMode>,
	document.querySelector("#content"),
	() => {
		console.log("App rendered!");
	},
);

async function getCollaborativeText(client: TinyliciousClient): Promise<SharedString> {
	const containerInfo = await getContainerInfo(client);
	const container = containerInfo.container;
	let containerId: string;

	// Get or create the document depending if we are running through the create new flow
	if (!location.hash) {
		containerId = await container.attach();
		// The new container has its own unique ID that can be used to access it in another session
		location.hash = containerId;
	} else {
		containerId = location.hash.substring(1);
	}
	document.title = containerId;

	return await container.create(SharedString);
}

async function getContainerInfo(client: TinyliciousClient) {
	let containerInfo;
	if (!location.hash) {
		// The client will create a new container using the schema
		containerInfo = await client.createContainer(containerSchema);
	} else {
		const containerId = location.hash.substring(1);
		// Use the unique container ID to fetch the container created earlier
		containerInfo = await client.getContainer(containerId, containerSchema);
	}
	return containerInfo;
}

/**
 * Registers container described by the input `containerInfo` with the provided devtools instance.
 */
function registerContainerWithDevtools(
	devtools: IDevtools,
	container: IFluidContainer,
	containerKey: ContainerKey,
): void {
	devtools.registerContainerDevtools({
		container,
		containerKey,
		dataVisualizers: undefined, // Use defaults
	});
}
