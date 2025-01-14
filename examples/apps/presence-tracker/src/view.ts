/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	focusMessageDiv.style.top = "50px";
	focusMessageDiv.style.left = "10px";
	focusMessageDiv.style.color = "red";
	focusMessageDiv.style.fontWeight = "bold";
	focusMessageDiv.style.fontSize = "18px";
	focusMessageDiv.style.border = "2px solid red";
	focusMessageDiv.style.padding = "10px";
	focusMessageDiv.style.display = "none";
	wrapperDiv.appendChild(focusMessageDiv);

	const onFocusChanged = () => {
		focusDiv.innerHTML = getFocusPresencesString("</br>", focusTracker);
		const focusPresences = focusTracker.getFocusPresences();
		const session = focusTracker.getMyself();
		const hasFocus = focusPresences.get(session);

		// hasFocus === undefined/true should hide the message (set to "none")
		const display = hasFocus === false ? "" : "none";
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

	focusTracker.getFocusPresences().forEach((hasFocus, sessionClient) => {
		const prefix = `User session ${sessionClient.sessionId}:`;
		if (hasFocus === undefined) {
			focusString.push(`${prefix} unknown focus`);
		} else if (hasFocus === true) {
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

		for (const [sessionClient, mousePosition] of mouseTracker.getMousePresences()) {
			if (focusTracker.getFocusPresences().get(sessionClient) === true) {
				const posDiv = document.createElement("div");
				posDiv.textContent = `/${sessionClient.sessionId}`;
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

export function renderControlPanel(mouseTracker: MouseTracker, controlPanel: HTMLDivElement) {
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

	slider.addEventListener("input", (e) => {
		sliderLabel.textContent = `mouse allowableUpdateLatencyMs: ${slider.value}`;
		const target = e.target as HTMLInputElement;
		mouseTracker.setAllowableLatency(parseInt(target.value, 10));
	});
}
