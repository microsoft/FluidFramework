/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type { LatestRaw, Presence } from "@fluidframework/presence";

import type { IDiceRollerController } from "./controller.js";
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

/**
 * Creates a DOM section showing the current user and all other connected users.
 * User IDs are truncated to 8 characters for readability.
 *
 * @param audience - Audience providing member info. When `undefined` (e.g. in tests), returns a placeholder.
 */
function makeAudienceView(audience?: IAudience): HTMLDivElement {
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
		const members = audience.getMembers();
		const self = audience.getSelf();
		const selfClientId = self?.clientId;
		const memberStrings: string[] = [];

		for (const [clientId, member] of members.entries()) {
			if (clientId !== selfClientId) {
				memberStrings.push(member.user.id.slice(0, 8));
			}
		}

		const selfMember =
			selfClientId === undefined ? undefined : audience.getMember(selfClientId);
		const currentUserDiv = document.createElement("div");
		currentUserDiv.textContent = `Current User: ${selfMember?.user.id.slice(0, 8) ?? "(unknown)"}`;
		const otherUsersDiv = document.createElement("div");
		otherUsersDiv.textContent = `Other Users: ${memberStrings.join(", ")}`;
		audienceDiv.replaceChildren(currentUserDiv, otherUsersDiv);
	};

	onAudienceChanged();
	audience.on("addMember", onAudienceChanged);
	audience.on("removeMember", onAudienceChanged);

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

/**
 * Renders the current remote last-roll state into `target` as a header row followed by one row per attendee.
 * Replaces all existing children on each call.
 */
export function makeDiceValuesView(
	target: HTMLDivElement,
	lastRoll: LatestRaw<DiceValues>,
): void {
	const children = makeDiceHeaderElement();
	for (const clientValue of lastRoll.getRemotes()) {
		children.push(...makeDiceValueElement(clientValue.attendee.attendeeId, clientValue.value));
	}
	target.replaceChildren(...children);
}

function addLogEntry(logDiv: HTMLDivElement, entry: string): void {
	const entryDiv = document.createElement("div");
	entryDiv.textContent = entry;
	logDiv.prepend(entryDiv);
}

/**
 * Creates a DOM section with two panels: a grid of each attendee's last dice rolls (updated in real-time
 * via presence), and a scrollable log of remote join/leave and roll activity.
 *
 * @param presenceConfig - Presence instance and last-roll state accessor. When `undefined` (e.g. in tests),
 * returns a placeholder.
 * @param audience - Audience used to resolve display names for attendee events.
 */
function makePresenceView(
	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	presenceConfig?: { presence: Presence; lastRoll: LatestRaw<DiceValues> },
	audience?: IAudience,
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
		presenceConfig.presence.attendees.events.on("attendeeConnected", (attendee) => {
			const name = audience.getMembers().get(attendee.getConnectionId())?.user.id.slice(0, 8);
			const update = `client ${name === undefined ? "(unnamed)" : `named ${name}`} 🔗 with id ${attendee.attendeeId} joined`;
			addLogEntry(logContentDiv, update);
		});

		presenceConfig.presence.attendees.events.on("attendeeDisconnected", (attendee) => {
			// Filter for remote attendees
			const self = audience.getSelf();
			if (self && attendee !== presenceConfig.presence.attendees.getAttendee(self.clientId)) {
				const name = audience
					.getMembers()
					.get(attendee.getConnectionId())
					?.user.id.slice(0, 8);
				const update = `client ${name === undefined ? "(unnamed)" : `named ${name}`} ⛓️‍💥 with id ${attendee.attendeeId} left`;
				addLogEntry(logContentDiv, update);
			}
		});
	}
	logDiv.append(logHeaderDiv, logContentDiv);

	presenceConfig.lastRoll.events.on("remoteUpdated", (update) => {
		const connected = update.attendee.getConnectionStatus() === "Connected" ? "🔗" : "⛓️‍💥";
		const updateText = `updated ${update.attendee.attendeeId.slice(0, 8)}'s ${connected} last rolls to ${JSON.stringify(update.value)}`;
		addLogEntry(logContentDiv, updateText);

		makeDiceValuesView(statesContentDiv, presenceConfig.lastRoll);
	});

	presenceDiv.append(statesDiv, logDiv);
	return presenceDiv;
}

/**
 * Builds the top-level app view: a row of dice rollers, an audience panel, and a presence panel.
 *
 * @param diceRollerControllers - One controller per die; each gets its own interactive roller view.
 * @param presenceConfig - Optional presence state (omit in tests to suppress presence UI).
 * @param audience - Optional audience (omit in tests to suppress audience UI).
 */
export function makeAppView(
	diceRollerControllers: IDiceRollerController[],
	// Biome insist on no semicolon - https://dev.azure.com/fluidframework/internal/_workitems/edit/9083
	presenceConfig?: { presence: Presence; lastRoll: LatestRaw<DiceValues> },
	audience?: IAudience,
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
