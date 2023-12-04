/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeCodecFamily, withDefaultBinaryEncoding } from "../../codec";
import { typeboxValidator } from "../../external-utilities";
import { mintRevisionTag } from "../../core";
import { TestChange } from "../testChange";
import { brand } from "../../util";
import { RevisionTagCodec, SummaryData, makeEditManagerCodec } from "../../shared-tree-core";
import { EncodingTestData, makeEncodingTestSuite } from "../utils";

const tags = Array.from({ length: 3 }, mintRevisionTag);

const trunkCommits: SummaryData<TestChange>["trunk"] = [
	{
		revision: tags[0],
		sessionId: "1",
		change: TestChange.mint([0], 1),
		sequenceNumber: brand(1),
	},
	{
		revision: tags[1],
		sessionId: "2",
		change: TestChange.mint([0, 1], 2),
		sequenceNumber: brand(2),
	},
	{
		revision: tags[2],
		sessionId: "1",
		change: TestChange.mint([0, 1, 2], 3),
		sequenceNumber: brand(3),
	},
];

const testCases: EncodingTestData<SummaryData<TestChange>, unknown> = {
	successes: [
		["empty", { trunk: [], branches: new Map() }],
		[
			"single commit",
			{
				trunk: trunkCommits.slice(0, 1),
				branches: new Map(),
			},
		],
		[
			"multiple commits",
			{
				trunk: trunkCommits,
				branches: new Map(),
			},
		],
		[
			"empty branch",
			{
				trunk: trunkCommits,
				branches: new Map([
					[
						"3",
						{
							base: tags[1],
							commits: [],
						},
					],
				]),
			},
		],
		[
			"non-empty branch",
			{
				trunk: trunkCommits,
				branches: new Map([
					[
						"4",
						{
							base: tags[1],
							commits: [
								{
									sessionId: "4",
									revision: mintRevisionTag(),
									change: TestChange.mint([0, 1], 4),
								},
							],
						},
					],
				]),
			},
		],
		[
			"multiple branches",
			{
				trunk: trunkCommits,
				branches: new Map([
					[
						"3",
						{
							base: tags[0],
							commits: [],
						},
					],
					[
						"4",
						{
							base: tags[1],
							commits: [
								{
									sessionId: "4",
									revision: mintRevisionTag(),
									change: TestChange.mint([0, 1], 4),
								},
							],
						},
					],
				]),
			},
		],
	],
	failures: {
		0: [
			[
				"missing revision",
				{
					base: tags[0],
					commits: [{ sessionId: "4", change: TestChange.mint([0], 1) }],
				},
			],
			[
				"missing sessionId",
				{
					base: tags[0],
					commits: [{ change: TestChange.mint([0], 1), revision: mintRevisionTag() }],
				},
			],
			["non-object", ""],
			[
				"commit with parent field",
				{
					trunk: trunkCommits.slice(0, 1).map((commit) => ({ ...commit, parent: 0 })),
					branches: [],
				},
			],
		],
	},
};

describe("EditManager codec", () => {
	const codec = makeEditManagerCodec(
		withDefaultBinaryEncoding(TestChange.codec),
		new RevisionTagCodec(),
		{
			jsonValidator: typeboxValidator,
		},
	);

	makeEncodingTestSuite(makeCodecFamily([[0, codec]]), testCases);

	// TODO: testing EditManagerSummarizer class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
