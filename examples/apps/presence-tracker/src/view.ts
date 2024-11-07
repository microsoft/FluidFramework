/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPresence, ISessionClient } from "@fluid-experimental/presence";
import type { IMember, IServiceAudience } from "fluid-framework";

import { type AppPresence, IMousePosition, positionMap } from "./presence.js";

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
		const localClientSessionId = mySessionClient.sessionId;
		console.log(`localSessionId: ${localClientSessionId}`);

		focusDiv.innerHTML = `
            Current user: ${localClientSessionId}</br>
            ${getFocusPresencesString("</br>", appPresence)}
        `;

		focusMessageDiv.style.display =
			localClientSessionId !== undefined && focus.clientValue(mySessionClient).value.focused
				? ""
				: "none";
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

	for (const client of focus.clients()) {
		// Workaroud for NYI .clientValues
		const { focused } = focus.clientValue(client).value;
		const prefix = `User ${client.sessionId}:`;
		if (focused === undefined) {
			focusString.push(`${prefix} ==> unknown focus`);
		} else if (focused) {
			focusString.push(`${prefix} ==> has focus`);
		} else {
			focusString.push(`${prefix} ==> missing focus`);
		}
	}

	return focusString.join(newLineSeparator);
}

export function renderMousePresence(appPresence: AppPresence, presence: IPresence, audience: IServiceAudience<IMember>, div: HTMLDivElement) {

	const { mouse, focus } = appPresence;
	const onPositionChanged = () => {
		console.log("entered onPositionChanged");

		div.innerHTML = "";
		// console.log(`looping mouse.clients()`);
		// for (const client of mouse.clients()) {
		// 	const connectionId = client.getConnectionId();
		// 	console.log(`connectionId: ${connectionId}`);

		// 	// Workaroud for NYI .clientValues
		// 	const position = mouse.clientValue(client).value;

		// 	const posDiv = document.createElement("div");
		// 	posDiv.textContent = `session ID: ${client.sessionId}`;
		// 	posDiv.style.position = "absolute";
		// 	posDiv.style.left = `${position.x}px`;
		// 	posDiv.style.top = `${position.y}px`;
		// 	posDiv.style.fontWeight = "bold";
		// 	div.appendChild(posDiv);
		// }
		const positions = getMousePresences(audience, presence);
		for (const [id, position] of positions) {
			const posDiv = document.createElement("div");
			posDiv.textContent = `UserId.connectionId: ${id}`;
			posDiv.style.position = "absolute";
			posDiv.style.left = `${position.x}px`;
			posDiv.style.top = `${position.y}px`;
			posDiv.style.fontWeight = "bold";
			div.appendChild(posDiv);
		}
	};
	onPositionChanged();

	mouse.events.on("updated", ({client, value})=> {
		positionMap.set(client, value);
		onPositionChanged();
	});

	presence.events.on("attendeeJoined", (sessionClient: ISessionClient) => {
		positionMap.set(sessionClient, { x: 0, y: 0 });
		onPositionChanged();
	});

	presence.events.on("attendeeDisconnected", (sessionClient: ISessionClient) => {
		positionMap.delete(sessionClient);
		onPositionChanged();
	});
}

export function addWindowListeners(appPresence: AppPresence) {
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

export function getMousePresences(
	audience: IServiceAudience<IMember>,
	presence: IPresence,
	// appPresence: AppPresence,
): Map<string, IMousePosition> {
	const statuses = new Map<string, IMousePosition>();
	// Demonstrates connecting service audience and presence attendees.
	// Getting from presence attendee to service audience member is not
	// as easy as there is no connection to the service audience member
	// lookup.
	for (const [userId, member] of audience.getMembers()) {
		for (const connection of member.connections) {
			const attendee = presence.getAttendee(connection.id);
			try {
				const position = positionMap.get(attendee);
				if (position !== undefined) {
					statuses.set(`${userId}.${connection.id}`, position);
				}
			}catch(error) {
				console.log(error);
				continue;
			}
		}
	}
	return statuses;
}
