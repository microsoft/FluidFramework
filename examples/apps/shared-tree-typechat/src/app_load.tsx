/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspClient } from "@fluid-experimental/odsp-client";
import { AzureClient } from "@fluidframework/azure-client";
import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createRoot } from "react-dom/client";
import { ReactApp } from "./react/ux.js";
import { appTreeConfiguration } from "./schema/app_schema.js";
import { sessionTreeConfiguration } from "./schema/session_schema.js";
import { createSessionPrompter } from "./utils/gpt_helpers.js";
import { createUndoRedoStacks } from "./utils/undo.js";
import { containerSchema } from "./schema/container_schema.js";
import { loadFluidData } from "./infra/fluid.js";
import { IFluidContainer } from "fluid-framework";

export async function loadApp(
	client: AzureClient | OdspClient,
	containerId: string,
): Promise<IFluidContainer> {
	// Initialize Fluid Container
	const { services, container } = await loadFluidData(containerId, containerSchema, client);

	// Initialize the SharedTree DDSes
	const sessionTree = container.initialObjects.sessionData.schematize(sessionTreeConfiguration);
	const appTree = container.initialObjects.appData.schematize(appTreeConfiguration);

	// create the root element for React
	const app = document.createElement("div");
	app.id = "app";
	document.body.appendChild(app);
	const root = createRoot(app);

	// Create undo/redo stacks for the app
	const undoRedo = createUndoRedoStacks(appTree.events);

	// Create an AI prompter for generating sessions
	let prompter: ReturnType<typeof createSessionPrompter> | undefined;

	// Render the app - note we attach new containers after render so
	// the app renders instantly on create new flow. The app will be
	// interactive immediately.
	root.render(
		<DndProvider backend={HTML5Backend}>
			<ReactApp
				conferenceTree={appTree}
				sessionTree={sessionTree}
				audience={services.audience}
				container={container}
				undoRedo={undoRedo}
				insertTemplate={async (prompt: string) => {
					if (prompter === undefined) {
						try {
							prompter = createSessionPrompter();
						} catch {
							return;
						}
					}
					const sessions = await prompter(prompt);
					if (sessions === undefined) {
						alert("AI failed to generate sessions. Please try again.");
						return;
					}
					appTree.root.sessions.insertAtEnd(...sessions);
				}} // eslint-disable-line @typescript-eslint/no-empty-function
			/>
		</DndProvider>,
	);

	return container;
}
