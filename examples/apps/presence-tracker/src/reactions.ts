/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Notifications } from "@fluidframework/presence/alpha";
import type { IPresence, ISessionClient } from "@fluidframework/presence/alpha";

import type { MouseTracker } from "./MouseTracker.js";

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
				send: (
					// position: IMousePosition,
					reaction: string,
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

	document.body.addEventListener("click", (e) => {
		reactions.emit.broadcast(
			"send",
			// mouseTracker.getClientMousePosition(presence.getMyself()),
			"❤️",
			"normal",
		);
	});

	document.body.addEventListener("keypress", (e) => {
		reactions.emit.broadcast(
			"send",
			// mouseTracker.getClientMousePosition(presence.getMyself()),
			e.key,
			"intense",
		);
	});

	// Extract a reference to the value manager we just created.
	const { reactions } = notifications.props;

	reactions.notifications.on("send", onReaction);

	function onReaction(
		client: ISessionClient,
		// position: IMousePosition,
		reaction: string,
		intensity: string,
	): void {
		const position = mouseTracker.getClientMousePosition(client);
		const reactionDiv = document.createElement("div");
		reactionDiv.className = "reaction";
		reactionDiv.style.position = "absolute";
		reactionDiv.style.left = `${position.x}px`;
		reactionDiv.style.top = `${position.y}px`;
		if (intensity === "intense") {
			reactionDiv.style.fontSize = "xxx-large";
		}
		reactionDiv.textContent = reaction;
		document.body.appendChild(reactionDiv);

		setTimeout(() => {
			reactionDiv.remove();
		}, 1000);
	}
}
