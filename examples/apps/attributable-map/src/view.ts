/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITimestampWatcher } from "./dataObject";

export function renderTimestampWatcher(timestampWatcher: ITimestampWatcher, div: HTMLDivElement) {
	// Create wrapper div and add styling
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.display = "flex";
	wrapperDiv.style.flexDirection = "column";
	wrapperDiv.style.justifyContent = "center";
	wrapperDiv.style.alignItems = "center";
	wrapperDiv.style.minHeight = "100vh";
	div.appendChild(wrapperDiv);

	// Create container div for timestamp text and add styling
	const timestampContainerDiv = document.createElement("div");
	timestampContainerDiv.style.fontSize = "5rem";
	timestampContainerDiv.style.fontWeight = "bold";
	timestampContainerDiv.style.marginBottom = "2rem";
	timestampContainerDiv.style.textAlign = "center";
	wrapperDiv.appendChild(timestampContainerDiv);

	// Create container div for attribution text and add styling
	const attributionContainerDiv = document.createElement("div");
	attributionContainerDiv.style.fontSize = "2rem";
	attributionContainerDiv.style.fontStyle = "italic";
	attributionContainerDiv.style.textAlign = "center";
	attributionContainerDiv.style.marginBottom = "2rem";
	wrapperDiv.appendChild(attributionContainerDiv);

	// Create button element and add styling
	const button = document.createElement("button");
	button.style.fontSize = "2rem";
	button.style.padding = "1rem 2rem";
	button.style.borderRadius = "1rem";
	button.style.backgroundColor = "#077b8a";
	button.style.color = "white";
	button.style.border = "none";
	button.style.cursor = "pointer";
	button.textContent = "Refresh";
	wrapperDiv.appendChild(button);

	button.addEventListener("click", timestampWatcher.refresh);

	// Function to update timestamp and attribution text
	const updateTimestamp = () => {
		const timestampString = timestampWatcher.map?.get("time-key").time ?? null;
		const attribution =
			JSON.stringify(timestampWatcher.map?.get("time-key").attribution) ?? null;

		timestampContainerDiv.textContent = timestampString;

		if (attribution !== null) {
			attributionContainerDiv.textContent = `Last updated by ${attribution}`;
			attributionContainerDiv.style.display = "block";
		} else {
			attributionContainerDiv.style.display = "none";
		}
	};

	updateTimestamp();

	// Use the timeRefresh event to trigger the rerender whenever the value changes.
	timestampWatcher.on("timeRefresh", updateTimestamp);
}
