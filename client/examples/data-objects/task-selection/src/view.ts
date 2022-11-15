/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRoller } from "./interface";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(diceRoller: IDiceRoller, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);

    const diceCharDiv = document.createElement("div");
    diceCharDiv.style.fontSize = "200px";

    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";
    // Call the roll method to modify the shared data when the button is clicked.
    rollButton.addEventListener("click", diceRoller.roll);

    const taskOwnerDiv = document.createElement("div");
    taskOwnerDiv.style.fontSize = "50px";

    wrapperDiv.append(diceCharDiv, rollButton, taskOwnerDiv);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDiceChar = () => {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceRoller.value);
        diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Just showing visually whether we're the task owner or not.
    const updateTaskOwner = () => {
        taskOwnerDiv.textContent = diceRoller.hasTask()
            ? "Task owner"
            : "Not task owner";
    };
    updateTaskOwner();

    // Use the diceRolled event to trigger the rerender whenever the value changes.
    diceRoller.on("diceRolled", updateDiceChar);
    diceRoller.on("taskOwnershipChanged", updateTaskOwner);
}
