/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Presence, StatesWorkspaceSchema } from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

const schema = {
	cursor: StateFactory.latest({
		local: { x: 0, y: 0 },
	}),
} as const satisfies StatesWorkspaceSchema;

export function renderCursorPresence(presence: Presence, div: HTMLDivElement) {
	const cursorStates = presence.states.getWorkspace("name:app-cursor", schema).states.cursor;

	const onRemotePositionChanged = () => {
		div.innerHTML = "";

		const rect = div.getBoundingClientRect();
		for (const data of cursorStates.getRemotes()) {
			if (data.attendee.getConnectionStatus() === "Connected") {
				const posDiv = document.createElement("div");
				posDiv.textContent = `/${data.attendee.attendeeId}`;
				posDiv.style.position = "absolute";
				// Make sure the cursor positions do not block interaction with the app
				posDiv.style.pointerEvents = "none";
				// X is center based for approximate alignment with other clients
				posDiv.style.left = `${data.value.x + rect.width / 2}px`;
				posDiv.style.top = `${data.value.y - 16}px`;
				posDiv.style.fontWeight = "bold";
				div.appendChild(posDiv);
			}
		}
	};

	onRemotePositionChanged();
	cursorStates.events.on("remoteUpdated", onRemotePositionChanged);
	// When an attendee disconnects, also update the cursor positions.
	presence.attendees.events.on("attendeeDisconnected", onRemotePositionChanged);
	presence.attendees.events.on("attendeeConnected", onRemotePositionChanged);

	// Listen to the local mousemove event and update the local position in the cursor state.
	window.addEventListener("mousemove", (e) => {
		// Alert all connected clients that there has been a change to this client's mouse position
		const rect = div.getBoundingClientRect();
		cursorStates.local = {
			// base X on center of div for approximate alignment with other clients
			x: e.clientX - rect.left - rect.width / 2,
			y: e.clientY,
		};
	});
}
