/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidContainer } from "fluid-framework";
import React from "react";
import ReactDOM from "react-dom";

import { containerSchema, createFluidData, loadFluidData } from "./fluid.js";
// eslint-disable-next-line import/no-unassigned-import
import "./output.css";
import { ReactApp } from "./reactApp.js";
import { Letter, treeConfiguration } from "./schema.js";

async function start(): Promise<void> {
	const app = document.createElement("div");
	app.id = "app";
	document.body.append(app);

	// Get the root item id from the URL
	// If there is no item id, then the app will make
	// a new container.
	let itemId: string = location.hash.slice(1);
	const createNew = itemId.length === 0;
	let container: IFluidContainer<typeof containerSchema>;

	if (createNew) {
		({ container } = await createFluidData(containerSchema));
	} else {
		({ container } = await loadFluidData(itemId, containerSchema));
	}

	const tree = container.initialObjects.appData;
	const appData = tree.viewWith(treeConfiguration);
	if (createNew) {
		appData.initialize({
			letters: [],
			word: [],
		});
	}

	const cellSize = { x: 32, y: 32 };
	const canvasSize = { x: 10, y: 10 }; // characters across and down

	// Render the app - note we attach new containers after render so
	// the app renders instantly on create new flow. The app will be
	// interactive immediately.
	ReactDOM.render(
		<ReactApp data={appData} canvasSize={canvasSize} cellSize={cellSize} />,
		app,
	);

	// If this is a new container, fill it with data
	if (createNew) {
		const used: { x: number; y: number }[] = [];
		let id = 0;
		[..."HELLOWORLD".repeat(500)].map((character) => {
			const x = Math.round(
				Math.floor((Math.random() * (canvasSize.x * cellSize.x)) / cellSize.x) * cellSize.x,
			);
			const y = Math.round(
				Math.floor((Math.random() * (canvasSize.y * cellSize.y)) / cellSize.y) * cellSize.y,
			);
			if (!used.some((element) => element.x === x && element.y === y)) {
				const pos = { x, y };
				used.push(pos);
				appData.root.letters.insertAtEnd(
					// TODO: error when not adding wrapping [] is inscrutable
					new Letter({
						position: pos,
						character,
						id: id.toString(),
					}),
				);
				id++;
			}
		});

		// Update the application state or components without forcing a full page reload
		ReactDOM.render(
			<ReactApp data={appData} canvasSize={canvasSize} cellSize={cellSize} />,
			app,
		);

		// If the app is in a `createNew` state - no itemId, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		itemId = await container.attach({ filePath: "foo/bar", fileName: "shared-tree-demo" });

		// The newly attached container is given a unique ID that can be used to access the container in another session
		// eslint-disable-next-line require-atomic-updates
		location.hash = itemId;
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(console.error);
