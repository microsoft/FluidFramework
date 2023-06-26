/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import { DiceRollerContainerRuntimeFactory, IDiceRollerAppModel } from "./containerCode";
import { renderDiceRoller } from "./view";

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const tinyliciousModelLoader = new TinyliciousModelLoader<IDiceRollerAppModel>(
		new StaticCodeLoader(new DiceRollerContainerRuntimeFactory()),
	);

	let id: string;
	let model: IDiceRollerAppModel;

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
	renderDiceRoller(model.diceRoller, contentDiv);

	let exportModel: IDiceRollerAppModel | undefined;

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	model.diceRoller.once("export", async (lastSequenceNumber: number) => {
		// console.log("Loading frozen container at seq #:", lastSequenceNumber);
		// Load frozen container at lastSequenceNumber
		exportModel = await tinyliciousModelLoader.loadExistingFrozen(id, lastSequenceNumber);
		console.log("Frozen container loaded at seq #:", exportModel.diceRoller.lastSequenceNumber);
		// Try reading data from exported model
		console.log("Reading exported model's dice value:", exportModel.diceRoller.value);
	});

	// Log each container's last sequence number as time passes
	setInterval(() => {
		console.log(
			"active container last seq #:",
			model.diceRoller.lastSequenceNumber,
			"|",
			"frozen container last seq #:",
			exportModel?.diceRoller.lastSequenceNumber,
		);
	}, 5000);
}

start().catch((error) => console.error(error));
