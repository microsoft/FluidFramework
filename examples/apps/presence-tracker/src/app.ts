/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceManager,
} from "@fluidframework/presence/alpha";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import type { ContainerSchema, IFluidContainer } from "fluid-framework";

import { FocusTracker } from "./FocusTracker.js";
import { MouseTracker } from "./MouseTracker.js";
import { initializeReactions } from "./reactions.js";
import { renderControlPanel, renderFocusPresence, renderMousePresence } from "./view.js";

// Define the schema of the Fluid container.
// This example uses the presence features only, so only that data object is added.
const containerSchema = {
	initialObjects: {
		// A Presence Manager object temporarily needs to be placed within container schema
		// https://github.com/microsoft/FluidFramework/blob/main/packages/framework/presence/README.md#onboarding
		presence: ExperimentalPresenceManager,
	},
} satisfies ContainerSchema;

export type PresenceTrackerSchema = typeof containerSchema;

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const client = new TinyliciousClient();
	let container: IFluidContainer<PresenceTrackerSchema>;

	let id: string;

	const createNew = location.hash.length === 0;
	if (createNew) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container } = await client.createContainer(containerSchema, "2"));

		// If the app is in a `createNew` state, and the container is detached, we attach the container.
		// This uploads the container to the service and connects to the collaboration session.
		id = await container.attach();
		// The newly attached container is given a unique ID that can be used to access the container in another session
		location.hash = id;
	} else {
		id = location.hash.slice(1);
		// Use the unique container ID to fetch the container created earlier.  It will already be connected to the
		// collaboration session.
		({ container } = await client.getContainer(id, containerSchema, "2"));
	}

	// Retrieve a reference to the presence APIs via the data object.
	const presence = acquirePresenceViaDataObject(container.initialObjects.presence);

	// Get the states workspace for the tracker data. This workspace will be created if it doesn't exist.
	// We create it with no states; we will pass the workspace to the Mouse and Focus trackers, and they will create value
	// managers within the workspace to track and share individual pieces of state.
	const appPresence = presence.getStates("name:trackerData", {});

	// Update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	// Initialize the trackers
	const focusTracker = new FocusTracker(presence, appPresence);
	const mouseTracker = new MouseTracker(presence, appPresence);

	initializeReactions(presence, mouseTracker);

	const focusDiv = document.getElementById("focus-content") as HTMLDivElement;
	renderFocusPresence(focusTracker, focusDiv);

	const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;
	renderMousePresence(mouseTracker, focusTracker, mouseContentDiv);

	const controlPanelDiv = document.getElementById("control-panel") as HTMLDivElement;
	renderControlPanel(mouseTracker, controlPanelDiv);

	// Setting "fluid*" is just for our test automation
	/* eslint-disable @typescript-eslint/dot-notation */
	window["fluidContainerId"] = id;
	window["fluidSessionId"] = presence.getMyself().sessionId;
	const buildAttendeeMap = () => {
		return [...presence.getAttendees()].reduce((map, a) => {
			map[a.sessionId] = a.getConnectionStatus();
			return map;
		}, {});
	};
	const checkAttendees = (expected: Record<string, string>): boolean => {
		const actual = buildAttendeeMap();
		const entriesActual = Object.entries(actual);
		const entriesExpected = Object.entries(expected);
		if (entriesActual.length !== entriesExpected.length) {
			return false;
		}
		for (const [k, v] of entriesExpected) {
			if (actual[k] !== v) {
				return false;
			}
		}
		return true;
	};
	window["fluidSessionAttendeeCheck"] = checkAttendees;
	window["fluidSessionAttendees"] = buildAttendeeMap();
	window["fluidSessionAttendeeCount"] = presence.getAttendees().size;
	presence.events.on("attendeeJoined", (attendee) => {
		console.log(`Attendee joined: ${attendee.sessionId}`);
		window["fluidSessionAttendees"] = buildAttendeeMap();
		window["fluidSessionAttendeeCount"] = presence.getAttendees().size;
		window["fluidAttendeeJoinedCalled"] = true;
	});
	presence.events.on("attendeeDisconnected", (attendee) => {
		console.log(`Attendee left: ${attendee.sessionId}`);
		window["fluidSessionAttendees"] = buildAttendeeMap();
		window["fluidSessionAttendeeCount"] = presence.getAttendees().size;
		window["fluidAttendeeDisconnectedCalled"] = true;
	});
	/* eslint-enable @typescript-eslint/dot-notation */
}

start().catch(console.error);
