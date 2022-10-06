/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureMember, IAzureAudience } from "@fluidframework/azure-client";

import { ICustomUserDetails } from "./app";
import { IDiceRollerController } from "./controller";

function makeDiceRollerView(diceRoller: IDiceRollerController): HTMLDivElement {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";

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
        diceCharDiv.textContent = String.fromCodePoint(0x267f + diceRoller.value);
        diceCharDiv.style.color = `hsl(${diceRoller.value * 60}, 70%, 50%)`;
    };
    updateDiceChar();

    // Use the diceRolled event to trigger the rerender whenever the value changes.
    diceRoller.on("diceRolled", updateDiceChar);
    return wrapperDiv;
}

function makeAudienceView(audience?: IAzureAudience): HTMLDivElement {
    // Accommodating the test which doesn't provide an audience
    if (audience === undefined) {
        const noAudienceDiv = document.createElement("div");
        noAudienceDiv.textContent = "No audience provided";
        return noAudienceDiv;
    }
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    wrapperDiv.style.margin = "70px";

    const audienceDiv = document.createElement("div");
    audienceDiv.style.fontSize = "20px";

    const onAudienceChanged = () => {
        const members = audience.getMembers();
        const self = audience.getMyself();
        const memberStrings: string[] = [];
        const useAzure = process.env.FLUID_CLIENT === "azure";

        members.forEach((member: AzureMember<ICustomUserDetails>) => {
            if (member.userId !== self?.userId) {
                if (useAzure) {
                    const memberString = `${member.userName}: {Gender: ${member.additionalDetails?.gender},
                        Email: ${member.additionalDetails?.email}}`;
                    memberStrings.push(memberString);
                } else {
                    memberStrings.push(member.userName);
                }
            }
        });
        audienceDiv.innerHTML = `
            Current User: ${self?.userName} <br />
            Other Users: ${memberStrings.join(", ")}
        `;
    };

    onAudienceChanged();
    audience.on("membersChanged", onAudienceChanged);

    wrapperDiv.appendChild(audienceDiv);
    return wrapperDiv;
}

export function makeAppView(
    diceRollerControllers: IDiceRollerController[],
    audience?: IAzureAudience,
): HTMLDivElement {
    const diceRollerViews = diceRollerControllers.map(makeDiceRollerView);
    const audienceView = makeAudienceView(audience);

    const wrapperDiv = document.createElement("div");
    wrapperDiv.append(...diceRollerViews, audienceView);
    return wrapperDiv;
}
