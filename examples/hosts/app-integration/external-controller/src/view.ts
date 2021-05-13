/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITinyliciousAudience, TinyliciousMember } from "@fluid-experimental/tinylicious-client";
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
 * Render an IDiceRollerController into a given div as a text character, with a button to roll it.
 * @param diceRoller - The dice roller to be rendered
 * @param div - The div to render into
 */
export function renderAudience(audience: ITinyliciousAudience, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    wrapperDiv.style.margin = "10px";
    div.appendChild(wrapperDiv);

    const audienceDiv = document.createElement("div");
    audienceDiv.style.fontSize = "20px";
    const lastEditedDiv = document.createElement("div");
    lastEditedDiv.style.fontSize = "20px";

    const onAudienceChanged = () => {
        const members = audience.getMembers();
        const currentMember = audience.getCurrentMember();
        const memberIds: string[] = [];
        members.forEach((member) => {
            if (member.userId !== currentMember?.userId) {
                memberIds.push(member.userId);
            }
        });
        audienceDiv.textContent = `
            Current User: ${currentMember?.userId} \n
            Other Users: ${memberIds.join(", ")}
        `;
    };

    const onLastEditedChanged = (member: TinyliciousMember) => {
        lastEditedDiv.textContent = `
            Last Edited By: ${member.userId} at ${member.connectedClients[0].timeLastActive?.toLocaleString()}
        `;
    };

    onAudienceChanged();

    audience.on("membersChanged", onAudienceChanged);
    audience.on("lastEditedMemberChanged", onLastEditedChanged);

    wrapperDiv.appendChild(audienceDiv);
    wrapperDiv.appendChild(lastEditedDiv);
}
