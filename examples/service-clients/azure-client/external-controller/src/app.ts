/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, AzureContainerServices } from "@fluidframework/azure-client";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/beta";
import { getPresence } from "@fluidframework/presence/beta";
import { createChildLogger } from "@fluidframework/telemetry-utils/legacy";
import { type IFluidContainer } from "fluid-framework";

import { DiceRollerController, type DieValue } from "./controller.js";
import {
	connectionConfig,
	diceRollerContainerSchema,
	initializeAppForNewContainer,
	loadAppFromExistingContainer,
	type DiceRollerContainerSchema,
} from "./fluid.js";
import { buildDicePresence } from "./presence.js";
import { TwoDiceApp } from "./schema.js";
import { makeAppView } from "./view.js";

async function start(): Promise<void> {
	// Create a custom ITelemetryBaseLogger object to pass into the Tinylicious container
	// and hook to the Telemetry system
	const baseLogger = createChildLogger();

	// Wrap telemetry logger for use with Devtools
	const devtoolsLogger = createDevtoolsLogger(baseLogger);

	const clientProps = {
		connection: connectionConfig,
		logger: devtoolsLogger,
	};
	const client = new AzureClient(clientProps);
	let container: IFluidContainer<DiceRollerContainerSchema>;
	let services: AzureContainerServices;
	let id: string;

	// Get or create the document depending if we are running through the create new flow
	let appModel: TwoDiceApp;
	const createNew = location.hash.length === 0;
	if (createNew) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container, services } = await client.createContainer(diceRollerContainerSchema, "2"));
		// const map1 = container.initialObjects.map1 as ISharedMap;
		// map1.set("diceValue", 1);
		// const map2 = container.initialObjects.map1 as ISharedMap;
		// map2.set("diceValue", 1);
		// console.log(map1.get("diceValue"));
		// Initialize our models so they are ready for use with our controllers
		appModel = initializeAppForNewContainer(container);

		// If the app is in a `createNew` state, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		id = await container.attach();
		// The newly attached container is given a unique ID that can be used to access the container in another session
		// eslint-disable-next-line require-atomic-updates
		location.hash = id;
	} else {
		id = location.hash.slice(1);
		// Use the unique container ID to fetch the container created earlier.  It will already be connected to the
		// collaboration session.
		({ container, services } = await client.getContainer(id, diceRollerContainerSchema, "2"));
		appModel = loadAppFromExistingContainer(container);
	}

	document.title = id;

	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	const lastRoll: { die1?: DieValue; die2?: DieValue } = {};
	const presence = getPresence(container);
	const states = buildDicePresence(presence).states;

	// Initialize Devtools
	initializeDevtools({
		logger: devtoolsLogger,
		initialContainers: [
			{
				container,
				containerKey: "Dice Roller Container",
			},
		],
	});

	// Here we are guaranteed that the maps have already been initialized for use with a DiceRollerController
	const diceRollerController1 = new DiceRollerController(appModel.dice1, (value) => {
		lastRoll.die1 = value;
		states.lastRoll.local = lastRoll;
		states.lastDiceRolls.local.set("die1", { value });
	});
	const diceRollerController2 = new DiceRollerController(appModel.dice2, (value) => {
		lastRoll.die2 = value;
		states.lastRoll.local = lastRoll;
		states.lastDiceRolls.local.set("die2", { value });
	});

	// lastDiceRolls is here just to demonstrate an example of LatestMap
	// Its updates are only logged to the console.
	states.lastDiceRolls.events.on("remoteItemUpdated", (update) => {
		console.log(
			`Client ${update.attendee.attendeeId.slice(0, 8)}'s ${update.key} rolled to ${update.value.value}`,
		);
	});

	const contentDiv = document.querySelector("#content") as HTMLDivElement;
	contentDiv.append(
		makeAppView(
			[diceRollerController1, diceRollerController2],
			{ presence, lastRoll: states.lastRoll },
			services.audience,
		),
	);
}

await start();
