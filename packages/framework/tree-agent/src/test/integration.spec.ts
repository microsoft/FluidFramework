/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	Page,
	Paragraph,
	Row,
	Smoke,
	Span,
	Table,
	Word,
	stringifyPage,
	stringifySmoke,
	stringifyTable,
	Conference,
	SessionType,
} from "./domains/index.js";
import { queryDomain } from "./utils.js";

describe("Agent Editing Integration", () => {
	for (const provider of ["openai", "anthropic", "gemini"] as const) {
		for (const editingType of ["editing", "functioning"] as const) {
			{
				describe(`${editingType} agent via ${provider}`, () => {
					it("Table Domain", async () => {
						const result = await queryDomain(
							"table",
							Table,
							{
								columns: ["Name", "Age", "Occupation"],
								rows: [
									new Row({
										cells: [{ content: "Alice" }, { content: 30 }, { content: "Engineer" }],
									}),
									new Row({
										cells: [{ content: "Bob" }, { content: 25 }, { content: "Designer" }],
									}),
									new Row({
										cells: [{ content: "Charlie" }, { content: 35 }, { content: "Manager" }],
									}),
								],
							},
							provider,
							editingType,
							"Please add a new row to the table with the name 'David', age 28, and occupation 'Artist'.",
							{ treeToString: stringifyTable },
						);

						assert.equal(result.root.rows.length, 4);
						assert.equal(result.root.rows[3]?.cells[0]?.content, "David");
						assert.equal(result.root.rows[3]?.cells[1]?.content, 28);
						assert.equal(result.root.rows[3]?.cells[2]?.content, "Artist");
					});

					it("Smoke Domain", async () => {
						const result = await queryDomain(
							"smoke",
							Smoke,
							{ color: "black" },
							provider,
							editingType,
							"A new pope has been chosen! Please change the color of the smoke accordingly.",
							{ treeToString: stringifySmoke },
						);

						assert.equal(result.root.color, "white");
					});

					it("Text Domain", async () => {
						const createdDate = new Date().toISOString();
						const result = await queryDomain(
							"text",
							Page,
							{
								paragraphs: [
									new Paragraph({
										content: [
											new Word({ characters: "Bagels", createdDate }),
											new Word({ characters: "are", createdDate }),
											new Span({
												words: [
													new Word({ characters: "a", createdDate }),
													new Word({ characters: "real", createdDate }),
													new Word({ characters: "treat", createdDate }),
												],
												bold: false,
												italic: true,
												comments: ["6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a"],
											}),
										],
									}),
								],
								comments: [
									{
										identifier: "6633f83b-c7b6-4f5e-9a9d-8f1e4f451b9a",
										text: "I love this expression!",
									},
								],
							},
							provider,
							editingType,
							"Please add a comment to the word 'treat' that says 'Makes me think of Halloween :)'",
							{
								treeToString: stringifyPage,
								domainHints: `You are an assistant that helps people create and edit pages of text. When adding new text, each word (e.g. "the", "cat", "lemonade", etc.) should go in its own Word object. Do not add comments or style the text (i.e. do not use Spans) unless the user specifically asked you to. If the user asks you to style a particular word or phrase that is already included in a larger span, you may split the span into smaller spans in order to apply the style at the granularity requested. Likewise, if two or more adjacent spans have the exact same styling, merge them together.`,
							},
						);

						assert.equal(result.root.comments.length, 2);
						// TODO: better validation
					});

					it("Conference Domain", async () => {
						await queryDomain(
							"conference",
							Conference,
							{
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
												abstract:
													"Can profit and the delightful smiles of the children coexist?",
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
							},
							provider,
							editingType,
							"Overhaul the entire conference. It needs to be longer, enough to fill up the whole week. Make sure there are at least three sessions per day - you may re-use the existing sessions in addition to adding more. We need some sessions for executives (revenue reports, quarterly planning, etc.) - the current ones are either technical, or for kids. Keep the sessions for executives on the same day or within two adjacent days. Finally, the conference is going to be in Chicago, so weave some Chicago references into three or four of the sessions. When you're done with that, please let me know - do you think this conference will be successful? Will people want to attend it, and why?",
						);
					});
				});
			}
		}
	}
});
