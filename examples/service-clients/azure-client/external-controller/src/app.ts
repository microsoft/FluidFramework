/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getPresenceFromContainer } from "@fluidframework/presence/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import type { Audience } from "@fluidframework/runtime-definitions/internal";
// eslint-disable-next-line import-x/no-internal-modules
import { getContainerAudience } from "@fluidframework/runtime-definitions/internal";

import { DiceRollerController, type DieValue } from "./controller.js";
import { diceRollerDataStoreKind, service } from "./fluid.js";
import { buildDicePresence } from "./presence.js";
import type { TwoDiceApp } from "./schema.js";
import { makeAppView } from "./view.js";

/**
 * Wires up controllers and renders the app UI into `#content` once the container is ready.
 *
 * @param appModel - The root data model containing both dice.
 * @param presence - Presence instance used to broadcast and observe remote dice rolls.
 * @param audience - Audience used to display currently-connected users.
 */
function setupApp(
	appModel: TwoDiceApp,
	presence: ReturnType<typeof getPresenceFromContainer>,
	audience: Audience,
): void {
	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	const lastRoll: { die1?: DieValue; die2?: DieValue } = {};
	const states = buildDicePresence(presence).states;

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
			audience,
		),
	);
}

/**
 * Entry point: creates a new container when no URL hash is present, otherwise loads the existing one.
 * The container ID is stored in `location.hash` so collaborators can share the URL.
 */
async function start(): Promise<void> {
	// No hash → create a new container; hash present → load an existing one
	const createNew = location.hash.length === 0;

	if (createNew) {
		const container = await service.createContainer(diceRollerDataStoreKind);
		// Attach uploads the container to the service and returns a stable ID
		const attached = await container.attach();
		// eslint-disable-next-line require-atomic-updates
		location.hash = attached.id;
		document.title = attached.id;
		setupApp(
			attached.data.root,
			getPresenceFromContainer(attached),
			getContainerAudience(attached),
		);
	} else {
		const id = location.hash.slice(1);
		const container = await service.loadContainer(id, diceRollerDataStoreKind);
		document.title = id;
		setupApp(
			container.data.root,
			getPresenceFromContainer(container),
			getContainerAudience(container),
		);
	}
}

await start();
