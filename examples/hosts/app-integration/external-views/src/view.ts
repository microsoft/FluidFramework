/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IKeyValueDataObject } from "./dataObject";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param droplet - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(DO: IKeyValueDataObject, div: HTMLDivElement) {
    const dataKey = 'dataKey';
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);

    const diceCharDiv = document.createElement("div");
    diceCharDiv.style.fontSize = "200px";

    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";
    // Set the value at our dataKey with a random number between 1 and 6.
    rollButton.addEventListener("click", () => DO.set(dataKey, Math.floor(Math.random() * 6) + 1));

    wrapperDiv.append(diceCharDiv, rollButton);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDiceChar = () => {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        diceCharDiv.textContent = String.fromCodePoint(0x267F + DO.get(dataKey));
        diceCharDiv.style.color = `hsl(${DO.get(dataKey) * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Use the changed event to trigger the rerender whenever the value changes.
    DO.on("changed", updateDiceChar);
}
