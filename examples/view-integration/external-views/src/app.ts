/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

const urlResolver = createInsecureTinyliciousTestUrlResolver();
const tokenProvider = createInsecureTinyliciousTestTokenProvider();
const documentServiceFactory = createRouterliciousDocumentServiceFactory(tokenProvider);
const codeLoader: ICodeDetailsLoader = {
	load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
		return {
			module: { fluidExport: new DiceRollerContainerRuntimeFactory() },
			details,
		};
	},
};

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

// Render view
const appDiv = document.getElementById("app") as HTMLDivElement;
const appRoot = createRoot(appDiv);
appRoot.render(createElement(DiceRollerView, { diceRoller }));

// Update url and tab title
location.hash = id;
document.title = id;
