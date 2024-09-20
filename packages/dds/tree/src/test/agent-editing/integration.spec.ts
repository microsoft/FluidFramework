/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeViewConfiguration } from "../../simple-tree/api/index.js";
import { getView } from "../utils.js";
import {
	generateTreeEdits,
	initializeOpenAIClient,
	KLUDGE,
} from "../../agent-editing/index.js";

const sf = new SchemaFactory("Planner");

export class Session extends sf.object("Session", {
	id: sf.identifier,
	title: sf.string,
	abstract: sf.string,
	sessionType: sf.required(sf.string, {
		metadata: {
			description:
				"This is one of four possible strings: 'Session', 'Workshop', 'Panel', or 'Keynote'",
		},
	}),
	created: sf.required(sf.number, { metadata: { llmDefault: () => Date.now() } }),
	lastChanged: sf.required(sf.number, { metadata: { llmDefault: () => Date.now() } }),
}) {}

const SessionType = {
	session: "Session",
	workshop: "Workshop",
	panel: "Panel",
	keynote: "Keynote",
};

export class Sessions extends sf.array("Sessions", Session) {}

export class Days extends sf.array("Days", Sessions) {}

export class Conference extends sf.object("Conference", {
	name: sf.string,
	sessions: sf.required(Sessions, {
		metadata: {
			description:
				"These sessions are not scheduled yet. The user (or AI agent) can move them to a specific day.",
		},
	}),
	days: Days,
	sessionsPerDay: sf.number,
}) {}

describe("Agent Editing Integration", () => {
	it("Test", async () => {
		process.env.AZURE_OPENAI_API_KEY = "TODO "; // DON'T COMMIT THIS
		process.env.AZURE_OPENAI_ENDPOINT = "TODO ";
		process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

		const view = getView(new TreeViewConfiguration({ schema: Conference }));
		view.initialize({
			name: "Roblox Creator x Investor Conference",
			sessions: [],
			days: [
				[
					{
						title: "Can Roblox achieve 120 hz?",
						abstract:
							"With the latest advancements in the G transformation, we may achieve up to 120 hz and still have time for lunch.",
						sessionType: SessionType.session,
						created: Date.now(),
						lastChanged: Date.now(),
					},
					{
						title: "What about fun?",
						abstract: "Can profit and the delightful smiles of the children coexist?",
						sessionType: SessionType.workshop,
						created: Date.now(),
						lastChanged: Date.now(),
					},
				],
				[
					{
						title: "Monetizing Children",
						abstract: "Maximize those Robux.",
						sessionType: SessionType.session,
						created: Date.now(),
						lastChanged: Date.now(),
					},
					{
						title:
							"The Gentrification of Roblox City's Downtown (and why that's a good thing)",
						abstract:
							"Real estate prices in Robloxia are skyrocketing, moving cash into the hands of those who can use it most wisely.",
						sessionType: SessionType.workshop,
						created: Date.now(),
						lastChanged: Date.now(),
					},
				],
			],
			sessionsPerDay: 2,
		});
		const client = initializeOpenAIClient();
		try {
			await generateTreeEdits(client, view, prompt);
		} catch (e) {
			const k = KLUDGE;
			console.log(k);
		}

		const stringified = JSON.stringify(view.root, undefined, 2);
		console.log(stringified);
	});
});

const prompt = "Please add a new session to the first day of the conference.";
