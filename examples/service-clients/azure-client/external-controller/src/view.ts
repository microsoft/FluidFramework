/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureMember, IAzureAudience } from "@fluidframework/azure-client";
import type { IPresence, LatestValueManager } from "@fluidframework/presence/alpha";

import { ICustomUserDetails } from "./app.js";
import { IDiceRollerController } from "./controller.js";
import type { DiceValues } from "./presence.js";

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
	const updateDiceChar = (): void => {
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

	const onAudienceChanged = (): void => {
		const members = audience.getMembers() as ReadonlyMap<
			string,
			AzureMember<ICustomUserDetails>
		>;
		const self = audience.getMyself();
		const memberStrings: string[] = [];
		const useAzure = process.env.FLUID_CLIENT === "azure";

		for (const member of members.values()) {
			if (member.id !== self?.id) {
				if (useAzure) {
					const memberString = `${member.name}: {Gender: ${member.additionalDetails?.gender},
                        Email: ${member.additionalDetails?.email}}`;
					memberStrings.push(memberString);
				} else {
					memberStrings.push(member.name);
				}
			}
		}

		audienceDiv.innerHTML = `
            Current User: ${self?.name} <br />
            Other Users: ${memberStrings.join(", ")}
        `;
	};

	onAudienceChanged();
	audience.on("membersChanged", onAudienceChanged);

	wrapperDiv.append(audienceDiv);
	return wrapperDiv;
}

function makeTextDivs(texts: string[]): HTMLDivElement[] {
	return texts.map((text) => {
		const valueElement = document.createElement("div");
		valueElement.textContent = text;
		return valueElement;
	});
}

function makeDiceHeaderElement(): HTMLDivElement[] {
	return makeTextDivs(["id", "Die 1", "Die 2"]);
}

function makeDiceValueElement(id: string, value: DiceValues): HTMLDivElement[] {
	return makeTextDivs([
		id.slice(0, 8),
		`${value.die1 ?? "not rolled"}`,
		`${value.die2 ?? "not rolled"}`,
	]);
}

export function makeDiceValuesView(
	target: HTMLDivElement,
	lastRoll: LatestValueManager<DiceValues>,
): void {
	const children = makeDiceHeaderElement();
	for (const clientValue of lastRoll.clientValues()) {
		children.push(...makeDiceValueElement(clientValue.client.sessionId, clientValue.value));
	}
	target.replaceChildren(...children);
}

function addLogEntry(logDiv: HTMLDivElement, entry: string): void {
	const entryDiv = document.createElement("div");
	entryDiv.textContent = entry;
	logDiv.prepend(entryDiv);
}

function makePresenceView(
	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	presenceConfig?: { presence: IPresence; lastRoll: LatestValueManager<DiceValues> },
	audience?: IAzureAudience,
): HTMLDivElement {
	const presenceDiv = document.createElement("div");
	// Accommodating the test which doesn't provide a presence
	if (presenceConfig === undefined) {
		presenceDiv.textContent = "No presence provided";
		return presenceDiv;
	}

	presenceDiv.style.display = "flex";
	presenceDiv.style.justifyContent = "center";

	const statesDiv = document.createElement("div");
	statesDiv.style.width = "30%";
	statesDiv.style.marginRight = "10px";
	statesDiv.style.border = "1px solid black";
	const statesHeaderDiv = document.createElement("div");
	statesHeaderDiv.textContent = "Last Rolls";
	statesHeaderDiv.style.border = "1px solid black";
	const statesContentDiv = document.createElement("div");
	statesContentDiv.style.height = "120px";
	statesContentDiv.style.overflowY = "scroll";
	statesContentDiv.style.border = "1px solid black";
	statesContentDiv.style.display = "grid";
	statesContentDiv.style.gridTemplateColumns = "1fr 1fr 1fr";
	statesContentDiv.style.alignContent = "start";
	statesDiv.append(statesHeaderDiv, statesContentDiv);

	const logDiv = document.createElement("div");
	logDiv.style.width = "70%";
	logDiv.style.border = "1px solid black";
	const logHeaderDiv = document.createElement("div");
	logHeaderDiv.textContent = "Remote Activity Log";
	logHeaderDiv.style.border = "1px solid black";
	const logContentDiv = document.createElement("div");
	logContentDiv.style.height = "120px";
	logContentDiv.style.overflowY = "scroll";
	logContentDiv.style.border = "1px solid black";
	if (audience !== undefined) {
		presenceConfig.presence.events.on("attendeeJoined", (attendee) => {
			const name = audience.getMembers().get(attendee.getConnectionId())?.name;
			const update = `client ${name === undefined ? "(unnamed)" : `named ${name}`} 🔗 with id ${attendee.sessionId} joined`;
			addLogEntry(logContentDiv, update);
		});

		presenceConfig.presence.events.on("attendeeDisconnected", (attendee) => {
			// Filter for remote attendees
			const self = audience.getMyself();
			if (self && attendee !== presenceConfig.presence.getAttendee(self.currentConnection)) {
				const name = audience.getMembers().get(attendee.getConnectionId())?.name;
				const update = `client ${name === undefined ? "(unnamed)" : `named ${name}`} ⛓️‍💥 with id ${attendee.sessionId} left`;
				addLogEntry(logContentDiv, update);
			}
		});
	}
	logDiv.append(logHeaderDiv, logContentDiv);

	presenceConfig.lastRoll.events.on("updated", (update) => {
		const connected = update.client.getConnectionStatus() === "Connected" ? "🔗" : "⛓️‍💥";
		const updateText = `updated ${update.client.sessionId.slice(0, 8)}'s ${connected} last rolls to ${JSON.stringify(update.value)}`;
		addLogEntry(logContentDiv, updateText);

		makeDiceValuesView(statesContentDiv, presenceConfig.lastRoll);
	});

	presenceDiv.append(statesDiv, logDiv);
	return presenceDiv;
}

export function makeAppView(
	diceRollerControllers: IDiceRollerController[],
	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	presenceConfig?: { presence: IPresence; lastRoll: LatestValueManager<DiceValues> },
	audience?: IAzureAudience,
): HTMLDivElement {
	const diceRollerViews = diceRollerControllers.map((controller) =>
		makeDiceRollerView(controller),
	);
	const diceView = document.createElement("div");
	diceView.style.display = "flex";
	diceView.style.justifyContent = "center";
	diceView.append(...diceRollerViews);

	const audienceView = makeAudienceView(audience);

	const presenceView = makePresenceView(presenceConfig, audience);

	const wrapperDiv = document.createElement("div");
	wrapperDiv.append(diceView, audienceView, presenceView);
	return wrapperDiv;
}
