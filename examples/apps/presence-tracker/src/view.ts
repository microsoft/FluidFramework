/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAzureAudience } from "@fluidframework/azure-client";

import type { IMousePosition } from "./MouseTracker.js";
import { getFocusPresences, type AppPresence } from "./presence.js";

export function renderFocusPresence(
	mousePresence: AppPresence,
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
		console.log("entered onFocusChanged");
		const currentUserConnectionId = audience.getMyself()?.currentConnection;
		console.log(`currentUserConnectionId: ${currentUserConnectionId}`);

		const userSessionId = focus
			.clients()
			.map((c) => {
				console.log(c);
				return c;
			})
			.find((c) => c.getConnectionId() === currentUserConnectionId)?.sessionId;
		const focusPresences = getFocusPresences(mousePresence);

		focusDiv.innerHTML = `
            Current user: ${userSessionId}</br>
            ${getFocusPresencesString("</br>", mousePresence)}
        `;

		focusMessageDiv.style.display =
			userSessionId !== undefined && focusPresences.get(userSessionId) === false ? "" : "none";
	};

	// onFocusChanged();
	focus.events.on("updated", onFocusChanged);

	wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	mousePresence: AppPresence,
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
	mousePresence: AppPresence,
	div: HTMLDivElement,
) {
	const { mouse } = mousePresence;
	const onPositionChanged = () => {
		console.log("entered onPositionChanged");

		div.innerHTML = "";
		console.log(`mouse.clients()`);
		console.assert(mouse.clients().length > 0, "mouse.clients().length > 0");
		for (const client of mouse.clients()) {
			console.log(client);
			const connectionId = client.getConnectionId();
			console.log(connectionId);

			const position = mouse.clientValue(client).value;

			// if (
			// 	[...focus.clientValues()].some(({ client }) => client.sessionId === p.client.sessionId)
			// ) {
			const posDiv = document.createElement("div");
			posDiv.textContent = client.sessionId;
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
	addWindowListeners(mousePresence);
}

function addWindowListeners(mousePresence: AppPresence) {
	// console.log("Adding mousemove window event listener");
	window.addEventListener("mousemove", (e) => {
		// console.log(`mousemove: ${e}`);
		const position: IMousePosition = {
			x: e.clientX,
			y: e.clientY,
		};
		mousePresence.mouse.local = position;
	});

	window.addEventListener("focus", () => {
		console.log("focus true");
		mousePresence.focus.local = { focused: true };
	});

	window.addEventListener("blur", () => {
		console.log("focus false");
		mousePresence.focus.local = { focused: false };
	});
}
