/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAzureAudience } from "@fluidframework/azure-client";

import { getFocusPresences, type MousePresence } from "./presence.js";

export function renderFocusPresence(
	mousePresence: MousePresence,
	audience: IAzureAudience,
	div: HTMLDivElement,
) {
	const { focus } = mousePresence;

	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "left";
	wrapperDiv.style.margin = "70px";
	div.appendChild(wrapperDiv);

	const focusDiv = document.createElement("div");
	focusDiv.id = "focus-div";
	focusDiv.style.fontSize = "14px";

	const focusMessageDiv = document.createElement("div");
	focusMessageDiv.id = "message-div";
	focusMessageDiv.textContent = "Click to focus";
	focusMessageDiv.style.position = "absolute";
	focusMessageDiv.style.top = "10px";
	focusMessageDiv.style.right = "10px";
	focusMessageDiv.style.color = "red";
	focusMessageDiv.style.fontWeight = "bold";
	focusMessageDiv.style.fontSize = "18px";
	focusMessageDiv.style.border = "2px solid red";
	focusMessageDiv.style.padding = "10px";
	focusMessageDiv.style.display = "none";
	wrapperDiv.appendChild(focusMessageDiv);

	const onFocusChanged = () => {
		const currentUserConnectionId = audience.getMyself()?.currentConnection;
		const userSessionId = focus
			.clients()
			.find((c) => c.connectionId() === currentUserConnectionId)?.sessionId;
		const focusPresences = getFocusPresences(mousePresence);

		focusDiv.innerHTML = `
            Current user: ${userSessionId}</br>
            ${getFocusPresencesString("</br>", mousePresence)}
        `;

		focusMessageDiv.style.display =
			userSessionId !== undefined && focusPresences.get(userSessionId) === false ? "" : "none";
	};

	onFocusChanged();
	focus.events.on("updated", onFocusChanged);

	wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	mousePresence: MousePresence,
): string {
	const { focus } = mousePresence;
	const focusString: string[] = [];

	for (const s of focus.clientValues()) {
		const prefix = `User ${s.client.sessionId}:`;
		if (s.value.focused === undefined) {
			focusString.push(`${prefix} unknown focus`);
		} else if (s.value.focused) {
			focusString.push(`${prefix} has focus`);
		} else {
			focusString.push(`${prefix} missing focus`);
		}
	}

	return focusString.join(newLineSeparator);
}

export function renderMousePresence(
	// mouseTracker: LatestValueManager<IMousePosition>,
	// focusTracker: FocusTracker,
	mousePresence: MousePresence,
	div: HTMLDivElement,
) {
	const { mouse } = mousePresence;
	const onPositionChanged = () => {
		div.innerHTML = "";
		for (const p of mouse.clientValues()) {
			const position = p.value;

			// if (
			// 	[...focus.clientValues()].some(({ client }) => client.sessionId === p.client.sessionId)
			// ) {
			const posDiv = document.createElement("div");
			posDiv.textContent = p.client.sessionId;
			posDiv.style.position = "absolute";
			posDiv.style.left = `${position.x}px`;
			posDiv.style.top = `${position.y}px`;
			posDiv.style.fontWeight = "bold";
			div.appendChild(posDiv);
			// }
		}
	};

	onPositionChanged();
	mouse.events.on("updated", onPositionChanged);
}
