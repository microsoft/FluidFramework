/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import {
	DataObjectGridContainerRuntimeFactory,
	IDataObjectGridAppModel,
} from "./container.js";
import { DataObjectGridAppView } from "./dataObjectGridView.js";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const tinyliciousModelLoader = new TinyliciousModelLoader<IDataObjectGridAppModel>(
		new StaticCodeLoader(new DataObjectGridContainerRuntimeFactory()),
	);

	let id: string;
	let model: IDataObjectGridAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("content") as HTMLDivElement;

	const parsedUrl = new URL(window.location.href);
	const requestedItemId = parsedUrl.searchParams.get("item") ?? undefined;
	if (requestedItemId === undefined) {
		ReactDOM.render(
			React.createElement(DataObjectGridAppView, {
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

start().catch((e) => {
	console.error(e);
	console.log(
		"%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
		"font-size:30px",
	);
});
