/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { IRuntimeAttributor } from "@fluid-experimental/attributor";
import { IHitCounter, greenKey, redKey, ITinyliciousUser } from "./dataObject.js";

export function renderHitCounter(
	hitCounter: IHitCounter,
	runtimeAttributor: IRuntimeAttributor | undefined,
	div: HTMLDivElement,
) {
	const redCounterContainerDiv = document.getElementById("red-counter-container-div")!;
	const greenCounterContainerDiv = document.getElementById("green-counter-container-div")!;
	const redAttributionContainerDiv = document.getElementById("red-attribution-container-div");
	const greenAttributionContainerDiv = document.getElementById("green-attribution-container-div");

	const redButton = document.getElementById("red-button")!;
	redButton.addEventListener("click", () => {
		hitCounter.hit("red");
	});

	const greenButton = document.getElementById("green-button")!;
	greenButton.addEventListener("click", () => {
		hitCounter.hit("green");
	});

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
			/**
			 * A production application would manage detached and local attribution key types as well.
			 * The current example and attributor will concentrate solely on handling the attribution of the Op-stream type.
			 */
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
