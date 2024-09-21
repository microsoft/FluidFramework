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

export class Day extends sf.object("Day", {
	sessions: sf.required(Sessions, {
		metadata: {
			description: "The sessions scheduled on this day.",
		},
	}),
}) {}

export class Days extends sf.array("Days", Day) {}

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

describe.skip("Agent Editing Integration", () => {
	it("Test", async () => {
		process.env.OPENAI_API_KEY = "TODO "; // DON'T COMMIT THIS
		process.env.AZURE_OPENAI_API_KEY = "TODO "; // DON'T COMMIT THIS
		process.env.AZURE_OPENAI_ENDPOINT = "TODO ";
		process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

		const view = getView(new TreeViewConfiguration({ schema: Conference }));
		view.initialize({
			name: "Roblox Creator x Investor Conference",
			sessions: [],
			days: [
				{
					sessions: [
						{
							title: "Can Roblox achieve 120 hz?",
							abstract:
								"With the latest advancements in the G transformation, we may achieve up to 120 hz and still have time for lunch.",
							sessionType: SessionType.session,
							created: Date.now(),
							lastChanged: Date.now(),
						},
						{
							title: "Roblox in VR",
							abstract:
								"Grab your VR headset and discover the latest in Roblox VR technology. Attendees of this lecture will receive a free VR headset.",
							sessionType: SessionType.workshop,
							created: Date.now(),
							lastChanged: Date.now(),
						},
						{
							title: "What about fun?",
							abstract: "Can profit and the delightful smiles of the children coexist?",
							sessionType: SessionType.keynote,
							created: Date.now(),
							lastChanged: Date.now(),
						},
						{
							title: "Combat in Roblox",
							abstract:
								"Get the latest tips and tricks for fighting your friends in roblox. Bonus: learn how to make your own sword!",
							sessionType: SessionType.panel,
							created: Date.now(),
							lastChanged: Date.now(),
						},
					],
				},
				{
					sessions: [
						{
							title: "Monetizing Children",
							abstract: "Maximize those Robux.",
							sessionType: SessionType.session,
							created: Date.now(),
							lastChanged: Date.now(),
						},
						{
							title: "Racecars!",
							abstract:
								"Find out how to build the fastest racecar in Roblox. Then, challenge your friends!",
							sessionType: SessionType.workshop,
							created: Date.now(),
							lastChanged: Date.now(),
						},
						{
							title:
								"The Gentrification of Roblox City's Downtown (and why that's a good thing)",
							abstract:
								"Real estate prices in Robloxia are skyrocketing, moving cash into the hands of those who can use it most wisely.",
							sessionType: SessionType.session,
							created: Date.now(),
							lastChanged: Date.now(),
						},
					],
				},
			],
			sessionsPerDay: 2,
		});
		const openAIClient = initializeOpenAIClient("azure");
		const abortController = new AbortController();
		await generateTreeEdits({ openAIClient, treeView: view, prompt, abortController });

		const k = KLUDGE;
		console.log(k);

		const stringified = JSON.stringify(view.root, undefined, 2);
		console.log(stringified);
	});
});

const prompt =
	"Please add a third day with several sessions about minecraft. Focus specifically on how it competes with roblox and move the session about monetizing to the third day too.";
