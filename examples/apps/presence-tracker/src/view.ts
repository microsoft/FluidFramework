/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Picker } from "emoji-picker-element";

import { FocusTracker, type IFocusState } from "./FocusTracker.js";
import { MouseTracker } from "./MouseTracker.js";

export function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "left";
	wrapperDiv.style.margin = "10px";
	div.appendChild(wrapperDiv);

	const focusDiv = document.createElement("div");
	focusDiv.id = "focus-div";
	focusDiv.style.fontSize = "14px";

	const onFocusChanged = (focusState: IFocusState) => {
		focusDiv.innerHTML = getFocusPresencesString("<br>", focusTracker);
	};

	onFocusChanged({ hasFocus: window.document.hasFocus() });
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
		if (hasFocus) {
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

	const reactionsConfigDiv = document.createElement("div");
	reactionsConfigDiv.id = "reactions-config";
	const reactionLabelDiv = document.createElement("div");
	reactionLabelDiv.style.marginTop = "10px";
	reactionLabelDiv.style.marginBottom = "10px";
	reactionLabelDiv.textContent = "Selected reaction:";
	reactionsConfigDiv.appendChild(reactionLabelDiv);

	// This span element contains the selected emoji
	const selectedSpan = document.createElement("span");
	selectedSpan.id = "selected-reaction";
	selectedSpan.textContent = "❤️";
	reactionLabelDiv.appendChild(selectedSpan);

	// Create the emoji-picker element and add it to the panel
	const picker = new Picker();
	reactionsConfigDiv.appendChild(picker);
	controlPanel.appendChild(reactionsConfigDiv);

	// Update the selected reaction emoji when the picker is clicked
	controlPanel
		.querySelector("emoji-picker")
		?.addEventListener("emoji-click", (event: Event & { detail?: any }) => {
			selectedSpan.textContent = event.detail?.unicode;
		});
}
