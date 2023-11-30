/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import ReactDOM from "react-dom";
import { ITree } from "@fluid-experimental/tree2";
import { loadFluidData, schema } from "./fluid";
import { appSchemaConfig, letter } from "./schema";
import { ReactApp } from "./reactApp";

async function main() {
	// Get the root container id from the URL
	// If there is no container id, then the app will make
	// a new container.
	let containerId = location.hash.substring(1);

	// Initialize Fluid Container
	const { container } = await loadFluidData(containerId, schema);

	// Initialize the SharedTree Data Structure
	const appData = (container.initialObjects.appData as ITree).schematize(
		appSchemaConfig as any,
	) as any;

	const cellSize = { x: 32, y: 32 };
	const canvasSize = { x: 10, y: 10 }; // characters across and down

	// Create a root element (div with id 'app') in the HTML document
	const appRoot = document.createElement("div");
	appRoot.id = "app";
	document.body.appendChild(appRoot);

	// Define your React component
	const App = () => (
		<ReactApp
			data={appData}
			container={container}
			canvasSize={canvasSize}
			cellSize={cellSize}
		/>
	);
	// Render the app - note we attach new containers after render so
	// the app renders instantly on create new flow. The app will be
	// interactive immediately.
	const appContainer = document.createElement("div");
	appContainer.id = "app";
	document.body.appendChild(appContainer);

	ReactDOM.render(<App />, appContainer);

	// If this is a new container, fill it with data
	if (containerId.length === 0) {
		const used: { x: number; y: number }[] = [];
		let id = 0;
		"HELLOWORLD"
			.repeat(500)
			.split("")
			.map((character) => {
				const x = Math.round(
					Math.floor((Math.random() * (canvasSize.x * cellSize.x)) / cellSize.x) *
						cellSize.x,
				);
				const y = Math.round(
					Math.floor((Math.random() * (canvasSize.y * cellSize.y)) / cellSize.y) *
						cellSize.y,
				);
				if (!used.find((element) => element.x === x && element.y === y)) {
					const pos = { x, y };
					used.push(pos);
					appData.root.letters.insertAtEnd(
						// TODO: error when not adding wrapping [] is inscrutable
						[
							letter.create({
								position: pos,
								character,
								id: id.toString(),
							}),
						],
					);
					id++;
				}
			});
	}

	// If the app is in a `createNew` state - no containerId, and the container is detached, we attach the container.
	// This uploads the container to the service and connects to the collaboration session.
	if (containerId.length === 0) {
		containerId = await container.attach();

		// The newly attached container is given a unique ID that can be used to access the container in another session
		location.hash = containerId;
	}
}

export default main();
