/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Anthropic } from "@anthropic-ai/sdk";
// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	asTreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { SharedTreeSemanticAgent } from "../../agent.js";

const sf = new SchemaFactory("Planner");

// eslint-disable-next-line jsdoc/require-jsdoc
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
	created: sf.required(sf.number, {
		metadata: {
			// llmDefault: () => Date.now(), TODO: Add this back when we have a defaulting value solution
		},
	}),
	lastChanged: sf.required(sf.number, {
		metadata: {
			// llmDefault: () => Date.now(), TODO: Add this back when we have a defaulting value solution
		},
	}),
}) {}

const SessionType = {
	session: "Session",
	workshop: "Workshop",
	panel: "Panel",
	keynote: "Keynote",
};

// eslint-disable-next-line jsdoc/require-jsdoc
export class Sessions extends sf.array("Sessions", Session) {}

// eslint-disable-next-line jsdoc/require-jsdoc
export class Day extends sf.object("Day", {
	sessions: sf.required(Sessions, {
		metadata: {
			description: "The sessions scheduled on this day.",
		},
	}),
}) {}
// eslint-disable-next-line jsdoc/require-jsdoc
export class Days extends sf.array("Days", Day) {}

// eslint-disable-next-line jsdoc/require-jsdoc
export class Conference extends sf.object("Conference", {
	name: sf.string,
	sessions: sf.required(Sessions, {
		metadata: {
			description:
				"These sessions are not scheduled yet. The user (or AI agent) can move them to a specific day.",
		},
	}),
	days: Days,
}) {}

const factory = SharedTree.getFactory();

describe.skip("Agent Editing Integration", () => {
	it("Roblox Test", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: Conference }));

		view.initialize({
			name: "Roblox Creator x Investor Conference",
			sessions: [],
			days: [
				{
					sessions: [
						{
							title: "Can Roblox achieve 120 hz?",
							abstract:
								"With the latest advancements in the G transformation, we may achieve up to 120 hz and still have time for lunch. This highly technical talk will be given by a Phd in mathematics.",
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
							abstract: "Maximize those Robux? Or, confront an ethical dilemma?",
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
		});
		const client = new Anthropic({
			apiKey: "TODO",
		});

		const agent = new SharedTreeSemanticAgent(client, asTreeViewAlpha(view));

		await agent.applyPrompt(
			"Please organize the sessions so that the ones for adults are on the first day, and the ones that kids would find enjoyable are on the second day. Also make sure the sessions are in alphabetical order within the day.",
		);

		const stringified = JSON.stringify(view.root, undefined, 2);
		console.log(stringified);
	});
});
