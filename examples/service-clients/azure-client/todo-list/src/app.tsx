/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient } from "@fluidframework/azure-client";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/beta";
import { createChildLogger } from "@fluidframework/telemetry-utils/legacy";
import type { IFluidContainer } from "fluid-framework";
import React from "react";
// eslint-disable-next-line import/no-internal-modules -- This is the pattern prescribed by React
import { createRoot } from "react-dom/client";

import {
	connectionConfig,
	todoListContainerSchema,
	initializeAppForNewContainer,
	loadAppFromExistingContainer,
	type TodoListContainerSchema,
} from "./fluid.js";
import type { TodoList } from "./schema.js";
import { TodoListAppView } from "./view.js";

async function start(): Promise<void> {
	// Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
	// and hook to the Telemetry system
	const baseLogger = createChildLogger();

	// Wrap telemetry logger for use with Devtools
	const devtoolsLogger = createDevtoolsLogger(baseLogger);

	const clientProps = {
		connection: connectionConfig,
		logger: devtoolsLogger,
	};
	const client = new AzureClient(clientProps);
	let container: IFluidContainer<TodoListContainerSchema>;
	let containerId: string;

	// Get or create the document depending if we are running through the create new flow
	let appModel: TodoList;
	const createNew = location.hash.length === 0;
	if (createNew) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container } = await client.createContainer(todoListContainerSchema, "2"));
		// Initialize our models so they are ready for use with our controllers
		appModel = await initializeAppForNewContainer(container);

		// If the app is in a `createNew` state, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		containerId = await container.attach();
		// The newly attached container is given a unique ID that can be used to access the container in another session
		// eslint-disable-next-line require-atomic-updates
		location.hash = containerId;
	} else {
		containerId = location.hash.slice(1);
		// Use the unique container ID to fetch the container created earlier.  It will already be connected to the
		// collaboration session.
		({ container } = await client.getContainer(containerId, todoListContainerSchema, "2"));
		appModel = loadAppFromExistingContainer(container);
	}

	document.title = containerId;

	// Initialize Devtools
	initializeDevtools({
		logger: devtoolsLogger,
		initialContainers: [
			{
				container,
				containerKey: "Todo List Container",
			},
		],
	});

	const contentDiv = document.querySelector("#content") as HTMLDivElement;
	const root = createRoot(contentDiv);
	root.render(<TodoListAppView todoList={appModel} container={container} />);
}

await start();
