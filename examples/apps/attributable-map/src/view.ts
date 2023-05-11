/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRuntimeAttributor } from "@fluid-experimental/attributor";
import { IHitCounter, greenKey, redKey, ITinyliciousUser } from "./dataObject";

export function renderHitCounter(
	hitCounter: IHitCounter,
	runtimeAttributor: IRuntimeAttributor | undefined,
	div: HTMLDivElement,
) {
	// Create wrapper div and add styling
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.display = "flex";
	wrapperDiv.style.flexDirection = "column";
	wrapperDiv.style.justifyContent = "center";
	wrapperDiv.style.alignItems = "center";
	wrapperDiv.style.minHeight = "100vh";
	div.appendChild(wrapperDiv);

	// Create container div for counters and add styling
	const countersContainerDiv = document.createElement("div");
	countersContainerDiv.style.display = "flex";
	countersContainerDiv.style.width = "100%";
	countersContainerDiv.style.justifyContent = "space-around";
	countersContainerDiv.style.marginBottom = "2rem";
	wrapperDiv.appendChild(countersContainerDiv);

	const redCounterContainerDiv = document.createElement("div");
	redCounterContainerDiv.style.fontSize = "5rem";
	redCounterContainerDiv.style.fontWeight = "bold";
	redCounterContainerDiv.style.textAlign = "center";
	countersContainerDiv.appendChild(redCounterContainerDiv);

	const greenCounterContainerDiv = document.createElement("div");
	greenCounterContainerDiv.style.fontSize = "5rem";
	greenCounterContainerDiv.style.fontWeight = "bold";
	greenCounterContainerDiv.style.textAlign = "center";
	countersContainerDiv.appendChild(greenCounterContainerDiv);

	// Create container div for buttons and add styling
	const buttonsContainerDiv = document.createElement("div");
	buttonsContainerDiv.style.display = "flex";
	buttonsContainerDiv.style.width = "100%";
	buttonsContainerDiv.style.justifyContent = "space-around";
	buttonsContainerDiv.style.marginBottom = "2rem";
	wrapperDiv.appendChild(buttonsContainerDiv);

	// Create red button element and add styling
	const redButton = document.createElement("button");
	redButton.style.fontSize = "2rem";
	redButton.style.padding = "1rem 2rem";
	redButton.style.borderRadius = "1rem";
	redButton.style.backgroundColor = "#F84F31";
	redButton.style.color = "white";
	redButton.style.border = "none";
	redButton.style.cursor = "pointer";
	redButton.textContent = "Hit";
	buttonsContainerDiv.appendChild(redButton);

	redButton.addEventListener("click", () => {
		hitCounter.hit("red");
	});

	// Create green button element and add styling
	const greenButton = document.createElement("button");
	greenButton.style.fontSize = "2rem";
	greenButton.style.padding = "1rem 2rem";
	greenButton.style.borderRadius = "1rem";
	greenButton.style.backgroundColor = "#23C552";
	greenButton.style.color = "white";
	greenButton.style.border = "none";
	greenButton.style.cursor = "pointer";
	greenButton.textContent = "Hit";
	buttonsContainerDiv.appendChild(greenButton);

	greenButton.addEventListener("click", () => {
		hitCounter.hit("green");
	});

	// Create container div for attribution text and add styling
	const attributionContainerDiv = document.createElement("div");
	attributionContainerDiv.style.display = "flex";
	attributionContainerDiv.style.width = "100%";
	attributionContainerDiv.style.justifyContent = "space-around";
	attributionContainerDiv.style.marginBottom = "2rem";
	wrapperDiv.appendChild(attributionContainerDiv);

	const redAttributionContainerDiv = document.createElement("div");
	redAttributionContainerDiv.style.fontSize = "2rem";
	redAttributionContainerDiv.style.fontStyle = "italic";
	redAttributionContainerDiv.style.textAlign = "center";
	redAttributionContainerDiv.style.marginBottom = "2rem";
	attributionContainerDiv.appendChild(redAttributionContainerDiv);

	const greenAttributionContainerDiv = document.createElement("div");
	greenAttributionContainerDiv.style.fontSize = "2rem";
	greenAttributionContainerDiv.style.fontStyle = "italic";
	greenAttributionContainerDiv.style.textAlign = "center";
	greenAttributionContainerDiv.style.marginBottom = "2rem";
	attributionContainerDiv.appendChild(greenAttributionContainerDiv);

	// Function to update counter value and attribution text
	const updateView = () => {
		const greenValue = hitCounter.map?.get(greenKey);
		const redValue = hitCounter.map?.get(redKey);

		// update the counter value
		redCounterContainerDiv.textContent = redValue.toString();
		greenCounterContainerDiv.textContent = greenValue.toString();

		const greenAttributionKey = hitCounter.map?.getAttribution(greenKey);
		const redAttributionKey = hitCounter.map?.getAttribution(redKey);

		// update the attribution text
		const updateAttributionDisplay = (attributionKey, containerDiv) => {
			if (attributionKey !== undefined && attributionKey.type === "op") {
				const attribution = runtimeAttributor?.get(attributionKey);
				const userString = JSON.stringify(attribution?.user);
				const user = JSON.parse(userString) as ITinyliciousUser;
				const timestamp = new Date(attribution?.timestamp ?? JSON.stringify(null));
				containerDiv.textContent = `Last updated by ${
					user.name
				}\non ${timestamp.toLocaleString()}`;
				containerDiv.style.display = "block";
			} else {
				containerDiv.style.display = "none";
			}
		};

		updateAttributionDisplay(redAttributionKey, redAttributionContainerDiv);
		updateAttributionDisplay(greenAttributionKey, greenAttributionContainerDiv);
	};

	updateView();

	// Use the hit event to trigger the re-render whenever the value changes.
	hitCounter.on("hit", updateView);
}
