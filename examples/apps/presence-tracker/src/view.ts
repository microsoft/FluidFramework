/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Picker } from "emoji-picker-element";

import type { FocusTracker, IFocusState } from "./FocusTracker.js";
import type { MouseTracker } from "./MouseTracker.js";

export function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement): void {
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "left";
	wrapperDiv.style.margin = "10px";
	div.append(wrapperDiv);

	const focusDiv = document.createElement("div");
	focusDiv.id = "focus-div";
	focusDiv.style.fontSize = "14px";

	const onFocusChanged = (focusState: IFocusState): void => {
		focusDiv.innerHTML = getFocusPresencesString("<br>", focusTracker);
	};

	onFocusChanged({ hasFocus: window.document.hasFocus() });
	focusTracker.on("focusChanged", onFocusChanged);

	wrapperDiv.append(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	focusTracker: FocusTracker,
): string {
	const focusString: string[] = [];

	for (const [sessionClient, hasFocus] of focusTracker.getFocusPresences().entries()) {
		const prefix = `User session ${sessionClient.attendeeId}:`;
		if (hasFocus) {
			focusString.push(`${prefix} has focus`);
		} else {
			focusString.push(`${prefix} missing focus`);
		}
	}
	return focusString.join(newLineSeparator);
}

export function renderMousePresence(
	mouseTracker: MouseTracker,
	focusTracker: FocusTracker,
	div: HTMLDivElement,
): void {
	const onPositionChanged = (): void => {
		div.innerHTML = "";

		for (const [sessionClient, mousePosition] of mouseTracker.getMousePresences()) {
			if (focusTracker.getFocusPresences().get(sessionClient) === true) {
				const posDiv = document.createElement("div");
				posDiv.textContent = `/${sessionClient.attendeeId}`;
				posDiv.style.position = "absolute";
				posDiv.style.left = `${mousePosition.x}px`;
				posDiv.style.top = `${mousePosition.y - 6}px`;
				posDiv.style.fontWeight = "bold";
				div.append(posDiv);
			}
		}
	};

	onPositionChanged();
	mouseTracker.on("mousePositionChanged", onPositionChanged);
}

export function renderControlPanel(
	mouseTracker: MouseTracker,
	controlPanel: HTMLDivElement,
): void {
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
	controlPanel.append(slider);
	controlPanel.append(sliderLabel);

	slider.addEventListener("input", (e: Event): void => {
		sliderLabel.textContent = `mouse allowableUpdateLatencyMs: ${slider.value}`;
		const target = e.target as HTMLInputElement;
		mouseTracker.setAllowableLatency(Number.parseInt(target.value, 10));
	});

	const reactionsConfigDiv = document.createElement("div");
	reactionsConfigDiv.id = "reactions-config";
	const reactionLabelDiv = document.createElement("div");
	reactionLabelDiv.style.marginTop = "10px";
	reactionLabelDiv.style.marginBottom = "10px";
	reactionLabelDiv.textContent = "Selected reaction:";
	reactionsConfigDiv.append(reactionLabelDiv);

	// This span element contains the selected emoji
	const selectedSpan = document.createElement("span");
	selectedSpan.id = "selected-reaction";
	selectedSpan.textContent = "❤️";
	reactionLabelDiv.append(selectedSpan);

	// Create the emoji-picker element and add it to the panel
	const picker = new Picker();
	reactionsConfigDiv.append(picker);
	controlPanel.append(reactionsConfigDiv);

	// Update the selected reaction emoji when the picker is clicked
	controlPanel
		.querySelector("emoji-picker")
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: use a real type
		?.addEventListener("emoji-click", (event: Event & { detail?: any }): void => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			selectedSpan.textContent = event.detail?.unicode;
		});
}
