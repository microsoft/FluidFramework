/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
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
import { createElement } from "react";
// eslint-disable-next-line import/no-internal-modules
import { createRoot } from "react-dom/client";

import { DiceRollerContainerRuntimeFactory, type IDiceRoller } from "./container/index.js";
import { DiceRollerView } from "./view.js";

const service = getSpecifiedServiceFromWebpack();
const {
	urlResolver,
	documentServiceFactory,
	createCreateNewRequest,
	createLoadExistingRequest,
} = await createExampleDriver(service);

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
	// Some services support or require specifying the container id at attach time (local, odsp). For
	// services that do not (t9s), the passed id will be ignored.
	id = Date.now().toString();
	const createNewRequest = createCreateNewRequest(id);
	container = await createDetachedContainer({
		codeDetails: { package: "1.0" },
		urlResolver,
		documentServiceFactory,
		codeLoader,
	});
	await container.attach(createNewRequest);
	// For most services, the id on the resolvedUrl is the authoritative source for the container id
	// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
	// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
	// we retain the id we generated above.
	if (service !== "odsp") {
		if (container.resolvedUrl === undefined) {
			throw new Error("Resolved Url unexpectedly missing!");
		}
		id = container.resolvedUrl.id;
	}
} else {
	id = location.hash.substring(1);
	container = await loadExistingContainer({
		request: await createLoadExistingRequest(id),
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
