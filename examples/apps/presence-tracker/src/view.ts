/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISessionClient } from "@fluid-experimental/presence";

import type { IMousePosition } from "./MouseTracker.js";
import { type AppPresence } from "./presence.js";

export function renderFocusPresence(
	mySessionClient: ISessionClient,
	appPresence: AppPresence,
	div: HTMLDivElement,
) {
	const { focus } = appPresence;

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
		// const currentUserConnectionId = mySessionClient.getConnectionId();
		// console.log(`currentUserConnectionId: ${currentUserConnectionId}`);

		const localSessionId = mySessionClient.sessionId;
		console.log(`localSessionId: ${localSessionId}`);
		// .clients()
			// .map((c) => {
			// 	console.log(c);
			// 	return c;
			// })
			// .find((c) => c.getConnectionId() === currentUserConnectionId)?.sessionId;
		// const focusPresences = getFocusPresences(appPresence);

		focusDiv.innerHTML = `
            Current user: ${localSessionId}</br>
            ${getFocusPresencesString("</br>", appPresence)}
        `;

		focusMessageDiv.style.display =
			localSessionId !== undefined && !focus.clientValue(mySessionClient).value.focused ? "" : "none";
	};

	// onFocusChanged();
	focus.events.on("updated", onFocusChanged);

	wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	appPresence: AppPresence,
): string {
	const { focus } = appPresence;
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
	mySessionClient: ISessionClient,
	appPresence: AppPresence,
	div: HTMLDivElement,
) {
	const { mouse, focus } = appPresence;
	const onPositionChanged = () => {
		console.log("entered onPositionChanged");

		div.innerHTML = "";
		console.log(`mouse.clients()`);
		// console.assert(mouse.clients().length > 0, "mouse.clients().length > 0");
		for (const client of mouse.clients()) {
			// console.log(client);
			const connectionId = client.getConnectionId();
			console.log(`connectionId: ${connectionId}`);
			const position = mouse.clientValue(client).value;

			// if (
			// 	[...focus.clientValues()].some(({ client }) => client.sessionId === p.client.sessionId)
			// ) {
			const posDiv = document.createElement("div");
			posDiv.textContent = `session ID: ${client.sessionId}`;
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

export function addWindowListeners(appPresence: AppPresence) {
	// console.log("Adding mousemove window event listener");
	window.addEventListener("mousemove", (e) => {
		// console.log(`mousemove: ${e}`);
		const position: IMousePosition = {
			x: e.clientX,
			y: e.clientY,
		};
		appPresence.mouse.local = position;
		// onPositionChanged();
	});

	window.addEventListener("focus", () => {
		console.log("focus true");
		appPresence.focus.local = { focused: true };
	});

	window.addEventListener("blur", () => {
		console.log("focus false");
		appPresence.focus.local = { focused: false };
	});
}
