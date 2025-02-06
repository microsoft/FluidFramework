/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Notifications } from "@fluidframework/presence/alpha";
import type { IPresence, ISessionClient } from "@fluidframework/presence/alpha";

import type { IMousePosition, MouseTracker } from "./MouseTracker.js";

/**
 * Initializes reactions support for the app. Initialization will create a presence Notifications workspace and connect
 * relevant event handlers. Reaction elements are added to the DOM in response to incoming notifications. These DOM
 * elements are automatically removed after a timeout.
 */
export function initializeReactions(presence: IPresence, mouseTracker: MouseTracker) {
	// Create a notifications workspace to send reactions-related notifications. This workspace will be created if it
	// doesn't exist. We create it with no notifications. We then add the Notifications value manager. You can also
	// initialize the workspace with value managers instead of adding them later.
	const notificationsWorkspace = presence.getNotifications(
		// A unique key identifying this workspace.
		"name:reactions",
		// Initialize a notifications workspace with the provided message schema.
		{
			reactions:
				Notifications<// This explicit generic type specification will not be required in the future.
				{
					reaction: (
						// In the future, we'll be able to use IMousePosition here.
						position: { x: number; y: number },
						value: string,
					) => void;
				}>(
					// Define a default listender. Listeners can also be added.
					{
						reaction: onReaction,
					},
				),
		},
	);

	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const notifications: typeof notificationsWorkspace = notificationsWorkspace;

	// Send a reaction to all clients on click.
	document.body.addEventListener("click", (e) => {
		// Get the current reaction value
		const selectedReaction = document.getElementById("selected-reaction") as HTMLSpanElement;
		const reactionValue = selectedReaction.textContent;

		// TODO: Check that we're connected before sending.
		notifications.props.reactions.emit.broadcast(
			"reaction",
			mouseTracker.getClientMousePosition(presence.getMyself()),
			reactionValue ?? "?",
		);
	});
}

/**
 * Renders reactions to the window using absolute positioning.
 */
function onReaction(client: ISessionClient, position: IMousePosition, value: string): void {
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
