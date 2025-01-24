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
 * elenents are automatically removed after a timeout.
 */
export function initializeReactions(presence: IPresence, mouseTracker: MouseTracker) {
	// Create a notifications workspace to send reactions-related notifications. This workspace will be created if it
	// doesn't exist. We create it with no notifications. We then add the Notifications value manager. You can also
	// initialize the workspace with value managers instead of adding them later.
	const notificationsWorkspace = presence.getNotifications(
		// A unique key identifying this workspace.
		"name:reactions",
		// Initialize an empty workspace
		{},
	);

	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const notifications: typeof notificationsWorkspace = notificationsWorkspace;

	// Add a Notifications value manager to the workspace.
	notifications.add(
		"reactions",
		Notifications<
			// This explicit generic type specification will not be required in the future.
			{
				reaction: (
					// In the future, we'll be able to use IMousePosition here.
					position: { x: number; y: number },
					value: string,
					intensity: "normal" | "intense",
				) => void;
			},
			"reactions"
		>(
			// We could define a default handler here that will be called when the notifications are received, but it is not
			// required. Listeners can be added later as shown below.
			{},
		),
	);

	// Send a "heart" reaction to all clients on click.
	document.body.addEventListener("click", (e) => {
		// Get the current reaction value
		const reactionDiv = document.getElementById("reactions-config") as HTMLDivElement;
		const reactionValue = reactionDiv.getAttribute("data-value");

		// TODO: Check that we're connected before sending.
		reactions.emit.broadcast(
			"reaction",
			mouseTracker.getClientMousePosition(presence.getMyself()),
			reactionValue ?? "?",
			"normal",
		);
	});

	// On keypress, send the corresponding key as a reaction to all clients.
	// document.body.addEventListener("keypress", (e) => {
	// 	// TODO: Check that we're connected before sending.
	// 	reactions.emit.broadcast(
	// 		"reaction",
	// 		mouseTracker.getClientMousePosition(presence.getMyself()),
	// 		e.key,
	// 		"intense",
	// 	);
	// });

	// Extract a reference to the value manager we just created.
	const { reactions } = notifications.props;

	reactions.notifications.on("reaction", onReaction);
}

/**
 * Renders reactions to the window using absolute positioning.
 */
function onReaction(
	client: ISessionClient,
	position: IMousePosition,
	value: string,
	intensity: string,
): void {
	const reactionDiv = document.createElement("div");
	reactionDiv.className = "reaction";
	reactionDiv.style.position = "absolute";
	reactionDiv.style.left = `${position.x}px`;
	reactionDiv.style.top = `${position.y}px`;
	if (intensity === "intense") {
		reactionDiv.style.fontSize = "xxx-large";
	}
	reactionDiv.textContent = value;
	document.body.appendChild(reactionDiv);

	setTimeout(() => {
		reactionDiv.remove();
	}, 1000);
}
