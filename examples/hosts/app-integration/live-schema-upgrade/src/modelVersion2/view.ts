/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRoller } from "./diceRoller";
import { IDiceCounter } from "./diceCounter";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(
	diceRoller: IDiceRoller,
	diceCounter: IDiceCounter,
	div: HTMLDivElement,
) {
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "center";
	div.append(wrapperDiv);

	const diceCharDiv = document.createElement("div");
	diceCharDiv.style.fontSize = "200px";

	const rollButton = document.createElement("button");
	rollButton.style.fontSize = "50px";
	rollButton.textContent = "Roll";
	// Call the roll method to modify the shared data when the button is clicked.
	rollButton.addEventListener("click", () => {
		diceRoller.roll();
		diceCounter.increment();
	});

	const counter = document.createElement("div");
	counter.textContent = `Counter: ${diceCounter.count}`;

	wrapperDiv.append(diceCharDiv, rollButton, counter);

	// Get the current value of the shared data to update the view whenever it changes.
	const updateDiceChar = () => {
		// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
		diceCharDiv.textContent = String.fromCodePoint(0x267f + diceRoller.value);
		diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
	};
	updateDiceChar();

	// Use the diceRolled event to trigger the rerender whenever the dice value changes.
	diceRoller.on("diceRolled", updateDiceChar);

	// Use the incremented event to trigger the renderer whenever the counter changes.
	const updateCounter = () => {
		counter.textContent = `Counter: ${diceCounter.count}`;
	};
	diceCounter.on("incremented", updateCounter);

	const onClosed = () => {
		rollButton.disabled = true;
		const closedText = document.createElement("div");
		closedText.textContent = "Container closed";
		wrapperDiv.append(closedText);
	};
	diceRoller.on("closed", onClosed);
}
