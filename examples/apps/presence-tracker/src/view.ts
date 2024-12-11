/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionClientStatus } from "@fluidframework/presence/alpha";

import { FocusTracker } from "./FocusTracker.js";
import { MouseTracker } from "./MouseTracker.js";

export function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
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
		const session = focusTracker.presence.getMyself();
		if(session.getConnectionStatus() === SessionClientStatus.Disconnected) {
			return;
		}

		const currentUser = focusTracker.audience.getMyself();
		const focusPresences = focusTracker.getFocusPresences();
		console.debug(focusPresences);
		const sessionConnection = session.getConnectionId();

		focusDiv.innerHTML = `
            Current user: ${currentUser?.name} - connection: ${sessionConnection} - focus: ${focusPresences.get(sessionConnection)}</br>
            ${getFocusPresencesString("</br>", focusTracker)}
        `;

		const display =
			currentUser !== undefined && focusPresences.get(sessionConnection) === true
				? ""
				: "none";
				console.log(`Setting display to ${display}`);
		focusMessageDiv.style.display = display;
	};

	onFocusChanged();
	focusTracker.on("focusChanged", onFocusChanged);

	wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	focusTracker: FocusTracker,
): string {
	const focusString: string[] = [];

	focusTracker.getFocusPresences().forEach((focus, userName) => {
		const prefix = `User ${userName}:`;
		if (focus === undefined) {
			focusString.push(`${prefix} unknown focus`);
		} else if (focus === true) {
			focusString.push(`${prefix} has focus`);
		} else {
			focusString.push(`${prefix} missing focus`);
		}
	});
	return focusString.join(newLineSeparator);
}

export function renderMousePresence(
	mouseTracker: MouseTracker,
	focusTracker: FocusTracker,
	div: HTMLDivElement,
) {
	const onPositionChanged = () => {
		div.innerHTML = "";

		for (const [clientConnectionId, mousePosition] of mouseTracker.getMousePresences()) {
			if (focusTracker.getFocusPresences().get(clientConnectionId) === true) {
				const posDiv = document.createElement("div");
				posDiv.textContent = `/${clientConnectionId}`;
				posDiv.style.position = "absolute";
				posDiv.style.left = `${mousePosition.x}px`;
				posDiv.style.top = `${mousePosition.y - 6}px`;
				posDiv.style.fontWeight = "bold";
				div.appendChild(posDiv);
			}
		}
	};

	onPositionChanged();
	mouseTracker.on("mousePositionChanged", onPositionChanged);
}

export function renderControlPanel(controlPanel: HTMLDivElement) {
	controlPanel.style.paddingBottom = "10px";
	const slider = document.createElement("input");
	slider.type = "range";
	slider.id = "mouse-latency";
	slider.name = "mouse-latency";
	slider.min = "0";
	slider.max = "200";
	slider.defaultValue = "60";
	const sliderLabel = document.createElement("label");
	sliderLabel.htmlFor = "mouse-latency";
	sliderLabel.textContent = `mouse allowableUpdateLatencyMs: ${slider.value}`;
	controlPanel.appendChild(slider);
	controlPanel.appendChild(sliderLabel);

	slider.addEventListener("input", (evt) => {
		sliderLabel.textContent = `mouse allowableUpdateLatencyMs: ${slider.value}`;
	});
}
