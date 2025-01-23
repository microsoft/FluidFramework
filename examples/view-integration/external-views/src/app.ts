/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader } from "@fluid-example/example-utils";
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

import { DiceRollerContainerRuntimeFactory } from "./containerCode.js";
import type { IDiceRoller } from "./interface.js";
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
	let diceRoller: IDiceRoller;

	if (location.hash.length === 0) {
		const container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		diceRoller = (await container.getEntryPoint()) as IDiceRoller;
		await container.attach(createTinyliciousTestCreateNewRequest());
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url not available on attached container");
		}
		id = container.resolvedUrl.id;
	} else {
		id = location.hash.substring(1);
		const container = await loadExistingContainer({
			request: { url: id },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		diceRoller = (await container.getEntryPoint()) as IDiceRoller;
	}

	render(diceRoller);
	updateTabForId(id);
}

start().catch((error) => console.error(error));
