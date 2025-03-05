/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
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

import { DiceRollerContainerRuntimeFactory, type IDiceRoller } from "./container/index.js";
import { DiceRollerView } from "./view.js";

const updateTabForId = (id: string): void => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const render = (diceRoller: IDiceRoller): void => {
	const appDiv = document.getElementById("app") as HTMLDivElement;
	const appRoot = createRoot(appDiv);
	appRoot.render(createElement(DiceRollerView, { diceRoller }));
};

const urlResolver = createInsecureTinyliciousTestUrlResolver();
const tokenProvider = createInsecureTinyliciousTestTokenProvider();
const documentServiceFactory = createRouterliciousDocumentServiceFactory(tokenProvider);
const codeLoader = new StaticCodeLoader(new DiceRollerContainerRuntimeFactory());

async function start(): Promise<void> {
	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		await container.attach(createTinyliciousTestCreateNewRequest());
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url unexpectedly missing!");
		}
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.substring(1);
		container = await loadExistingContainer({
			request: { url: id },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	const diceRoller = (await container.getEntryPoint()) as IDiceRoller;
	render(diceRoller);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
