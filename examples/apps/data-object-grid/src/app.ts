/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";
import { createElement } from "react";
import ReactDOM from "react-dom";

import {
	DataObjectGridContainerRuntimeFactory,
	type IDataObjectGridAppModel,
} from "./container.js";
import { DataObjectGridAppView } from "./dataObjectGridView.js";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start(): Promise<void> {
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new DataObjectGridContainerRuntimeFactory());

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
			// eslint-disable-next-line require-atomic-updates
			id = container.resolvedUrl.id;
		}
	} else {
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	// Get the model from the container
	const model = (await container.getEntryPoint()) as IDataObjectGridAppModel;

	// update the browser URL and the window title with the actual container ID
	// eslint-disable-next-line require-atomic-updates
	location.hash = id;
	document.title = id;

	const contentDiv = document.querySelector("#content");

	const parsedUrl = new URL(window.location.href);
	const requestedItemId = parsedUrl.searchParams.get("item") ?? undefined;
	if (requestedItemId === undefined) {
		ReactDOM.render(
			createElement(DataObjectGridAppView, {
				model: model.dataObjectGrid,
				getDirectUrl: (itemId: string) => `?item=${itemId}#${id}`,
			}),
			contentDiv,
		);
	} else {
		const item = model.dataObjectGrid.getItem(requestedItemId);
		if (item === undefined) {
			throw new Error("Item not found");
		}
		const view = await model.dataObjectGrid.getViewForItem(item);
		ReactDOM.render(view, contentDiv);
	}
}

try {
	await start();
} catch (error) {
	console.error(error);
	console.log(
		"%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
		"font-size:30px",
	);
}
