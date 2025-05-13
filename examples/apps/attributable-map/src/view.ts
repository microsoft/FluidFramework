/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { IRuntimeAttributor } from "@fluid-experimental/attributor";
import type { AttributionKey } from "@fluidframework/runtime-definitions/legacy";

import { IHitCounter, ITinyliciousUser, greenKey, redKey } from "./dataObject.js";

export function renderHitCounter(
	hitCounter: IHitCounter,
	runtimeAttributor: IRuntimeAttributor | undefined,
	div: HTMLDivElement,
): void {
	const redCounterContainerDiv = document.querySelector("#red-counter-container-div")!;
	const greenCounterContainerDiv = document.querySelector("#green-counter-container-div")!;
	const redAttributionContainerDiv = document.querySelector("#red-attribution-container-div")!;
	const greenAttributionContainerDiv = document.querySelector(
		"#green-attribution-container-div",
	)!;

	const redButton = document.querySelector("#red-button")!;
	redButton.addEventListener("click", () => {
		hitCounter.hit("red");
	});

	const greenButton = document.querySelector("#green-button")!;
	greenButton.addEventListener("click", () => {
		hitCounter.hit("green");
	});

	// update the attribution text
	const updateAttributionDisplay = (
		attributionKey: AttributionKey | undefined,
		containerDiv: Element,
	): void => {
		/**
		 * A production application would manage detached and local attribution key types as well.
		 * The current example and attributor will concentrate solely on handling the attribution of the Op-stream type.
		 */
		if (attributionKey !== undefined && attributionKey.type === "op") {
			const attribution = runtimeAttributor?.get(attributionKey);
			const userString = JSON.stringify(attribution?.user);
			const user = JSON.parse(userString) as ITinyliciousUser;
			// eslint-disable-next-line unicorn/no-null
			const timestamp = new Date(attribution?.timestamp ?? JSON.stringify(null));
			containerDiv.textContent = `Last updated by ${
				user.name
			}\non ${timestamp.toLocaleString()}`;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(containerDiv as any).style.display = "block";
		} else {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(containerDiv as any).style.display = "none";
		}
	};

	// Function to update counter value and attribution text
	const updateView = (): void => {
		const greenValue: number | undefined = hitCounter.map?.get(greenKey);
		const redValue: number | undefined = hitCounter.map?.get(redKey);

		// update the counter value
		// eslint-disable-next-line unicorn/no-null
		redCounterContainerDiv.textContent = redValue?.toString() ?? null;
		// eslint-disable-next-line unicorn/no-null
		greenCounterContainerDiv.textContent = greenValue?.toString() ?? null;

		const greenAttributionKey = hitCounter.map?.getAttribution(greenKey);
		const redAttributionKey = hitCounter.map?.getAttribution(redKey);

		updateAttributionDisplay(redAttributionKey, redAttributionContainerDiv);
		updateAttributionDisplay(greenAttributionKey, greenAttributionContainerDiv);
	};

	updateView();

	// Use the hit event to trigger the re-render whenever the value changes.
	hitCounter.on("hit", updateView);
}
