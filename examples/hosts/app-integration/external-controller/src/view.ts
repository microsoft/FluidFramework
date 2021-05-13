/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAudience } from "@fluidframework/container-definitions";
import { IDiceRollerController } from "./controller";

/**
 * Render an IDiceRollerController into a given div as a text character, with a button to roll it.
 * @param diceRoller - The dice roller to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(diceRoller: IDiceRollerController, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.appendChild(wrapperDiv);

    const diceCharDiv = document.createElement("div");
    diceCharDiv.style.fontSize = "200px";

    const rollButton = document.createElement("button");
    rollButton.style.fontSize = "50px";
    rollButton.textContent = "Roll";
    // Call the roll method to modify the shared data when the button is clicked.
    rollButton.addEventListener("click", diceRoller.roll);

    wrapperDiv.append(diceCharDiv, rollButton);

    // Get the current value of the shared data to update the view whenever it changes.
    const updateDiceChar = () => {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        diceCharDiv.textContent = String.fromCodePoint(0x267F + diceRoller.value);
        diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Use the diceRolled event to trigger the rerender whenever the value changes.
    diceRoller.on("diceRolled", updateDiceChar);
}

/**
 * Render the user names of the members currently active in the session into the provided div
 * @param audience - Object that provides the list of current members and listeners for when the list changes
 * @param div - The div to render into
 */
export function renderAudience(audience: IAudience, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    wrapperDiv.style.margin = "70px";
    div.appendChild(wrapperDiv);

    const audienceDiv = document.createElement("div");
    audienceDiv.style.fontSize = "20px";

    const onAudienceChange = () => {
        const members = audience.getMembers();
        const memberNames: string[] = [];
        members.forEach((member) => {
            if (member.details.capabilities.interactive) {
                memberNames.push((member.user as any).name);
            }
        });
        audienceDiv.textContent = `Users: ${memberNames.join(", ")}`;
    };

    onAudienceChange();

    audience.on("addMember", onAudienceChange);
    audience.on("removeMember", onAudienceChange);

    wrapperDiv.appendChild(audienceDiv);
}
