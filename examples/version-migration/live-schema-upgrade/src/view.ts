/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRollerAppModel } from "./interfaces.js";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(model: IDiceRollerAppModel, div: HTMLDivElement): void {
	const diceRoller = model.diceRoller;
	const diceCounter = model.diceCounter;

	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "center";
	div.append(wrapperDiv);

	const diceCharDiv = document.createElement("div");
	diceCharDiv.style.fontSize = "200px";

	const rollButton = document.createElement("button");
	rollButton.style.fontSize = "50px";
	rollButton.textContent = "Roll";
	// Call the roll method to modify the shared data when the button is clicked.
	rollButton.addEventListener("click", (): void => {
		diceRoller.roll();
		if (diceCounter !== undefined) {
			diceCounter.increment();
		}
	});

	// Get the current value of the shared data to update the view whenever it changes.
	const updateDiceChar = (): void => {
		// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
		diceCharDiv.textContent = String.fromCodePoint(0x267f + diceRoller.value);
		diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
	};
	updateDiceChar();
	wrapperDiv.append(diceCharDiv, rollButton);

	// Use the diceRolled event to trigger the rerender whenever the dice value changes.
	diceRoller.on("diceRolled", updateDiceChar);

	if (diceCounter !== undefined) {
		const counter = document.createElement("div");
		counter.textContent = `Counter: ${diceCounter.count}`;

		wrapperDiv.append(counter);

		// Use the incremented event to trigger the renderer whenever the counter changes.
		const updateCounter = (): void => {
			counter.textContent = `Counter: ${diceCounter.count}`;
		};
		diceCounter.on("incremented", updateCounter);
	}

	// Use the closed event to stop the user from rolling and display a message.
	// Note: In real applications there may be other causes for the container to close, but for the purpose of this
	// example we will assume it was due to a schema upgrade.
	const onClosed = (): void => {
		rollButton.disabled = true;
		const closedText = document.createElement("div");
		closedText.textContent = "Application upgraded. Please refresh the page.";
		wrapperDiv.append(closedText);
	};
	diceRoller.on("closed", onClosed);
}
