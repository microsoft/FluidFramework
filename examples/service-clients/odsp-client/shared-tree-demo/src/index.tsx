/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import ReactDOM from "react-dom";

import { appDataStoreKind, service } from "./fluid.js";
// eslint-disable-next-line import-x/no-unassigned-import
import "./output.css";
import { ReactApp } from "./reactApp.js";
import { Letter } from "./schema.js";

async function start(): Promise<void> {
	const app = document.createElement("div");
	app.id = "app";
	document.body.append(app);

	// Get the root item id from the URL.
	// If there is no item id, the app will create a new container.
	const itemId: string = location.hash.slice(1);
	const createNew = itemId.length === 0;

	if (createNew) {
		const container = await service.createContainer(appDataStoreKind);
		const appData = container.data;

		const cellSize = { x: 32, y: 32 };
		const canvasSize = { x: 10, y: 10 }; // characters across and down

		// Render immediately so the app is interactive before attaching
		ReactDOM.render(
			<ReactApp data={appData} canvasSize={canvasSize} cellSize={cellSize} />,
			app,
		);

		// Populate with initial letter data
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
					new Letter({
						position: pos,
						character,
						id: id.toString(),
					}),
				);
				id++;
			}
		});

		// Re-render with populated data
		ReactDOM.render(
			<ReactApp data={appData} canvasSize={canvasSize} cellSize={cellSize} />,
			app,
		);

		// Attach uploads the container to ODSP and returns a stable item ID
		const attached = await container.attach();
		// eslint-disable-next-line require-atomic-updates
		location.hash = attached.id;
	} else {
		const container = await service.loadContainer(itemId, appDataStoreKind);
		const appData = container.data;

		const cellSize = { x: 32, y: 32 };
		const canvasSize = { x: 10, y: 10 };

		ReactDOM.render(
			<ReactApp data={appData} canvasSize={canvasSize} cellSize={cellSize} />,
			app,
		);
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(console.error);
