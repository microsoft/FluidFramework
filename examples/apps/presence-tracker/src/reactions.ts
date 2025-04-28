/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Notifications } from "@fluidframework/presence/alpha";
import type { Attendee, Presence } from "@fluidframework/presence/alpha";

import type { MouseTracker } from "./MouseTracker.js";
import type { IMousePosition } from "./types.js";

/**
 * Initializes reactions support for the app. Initialization will create a presence Notifications workspace and connect
 * relevant event handlers. Reaction elements are added to the DOM in response to incoming notifications. These DOM
 * elements are automatically removed after a timeout.
 */
export function initializeReactions(presence: Presence, mouseTracker: MouseTracker) {
	// Create a notifications workspace to send reactions-related notifications. This workspace will be created if it
	// doesn't exist. We also create a NotificationsManager. You can also
	// add presence objects to the workspace later.
	const notificationsWorkspace = presence.notifications.getWorkspace(
		// A unique key identifying this workspace.
		"name:reactions",
		{
			// Initialize a notifications manager with the provided message schema.
			reactions:
				Notifications<// This explicit generic type specification will not be required in the future.
				{
					reaction: (
						// In the future, we'll be able to use IMousePosition here.
						position: { x: number; y: number },
						value: string,
					) => void;
				}>(
					// Define a default listener. Listeners can also be added later.
					{
						reaction: onReaction,
					},
				),
		},
	);

	// Send a reaction to all clients on click.
	document.body.addEventListener("click", (e) => {
		// Get the current reaction value
		const selectedReaction = document.getElementById("selected-reaction") as HTMLSpanElement;
		const reactionValue = selectedReaction.textContent;

		// Check that we're connected before sending notifications.
		if (presence.attendees.getMyself().getConnectionStatus() === "Connected") {
			notificationsWorkspace.notifications.reactions.emit.broadcast(
				"reaction",
				mouseTracker.getMyMousePosition(),
				reactionValue ?? "?",
			);
		}
	});
}

/**
 * Renders reactions to the window using absolute positioning.
 */
function onReaction(client: Attendee, position: IMousePosition, value: string): void {
	const reactionDiv = document.createElement("div");
	reactionDiv.className = "reaction";
	reactionDiv.style.position = "absolute";
	reactionDiv.style.left = `${position.x}px`;
	reactionDiv.style.top = `${position.y}px`;
	reactionDiv.textContent = value;
	document.body.appendChild(reactionDiv);

	setTimeout(() => {
		reactionDiv.remove();
	}, 1000);
}
