/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { makeCodecFamily, withDefaultBinaryEncoding } from "../../../codec/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { TestChange } from "../../testChange.js";
import { brand } from "../../../util/index.js";
import { RevisionTagCodec } from "../../../core/index.js";
import { SummaryData, makeEditManagerCodec } from "../../../shared-tree-core/index.js";
import {
	EncodingTestData,
	MockIdCompressor,
	makeEncodingTestSuite,
	mintRevisionTag,
} from "../../utils.js";

const tags = Array.from({ length: 3 }, mintRevisionTag);

const trunkCommits: SummaryData<TestChange>["trunk"] = [
	{
		revision: tags[0],
		sessionId: "1" as SessionId,
		change: TestChange.mint([0], 1),
		sequenceNumber: brand(1),
	},
	{
		revision: tags[1],
		sessionId: "2" as SessionId,
		change: TestChange.mint([0, 1], 2),
		sequenceNumber: brand(2),
	},
	{
		revision: tags[2],
		sessionId: "1" as SessionId,
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

export function testCodec() {
	describe("Codec", () => {
		const codec = makeEditManagerCodec(
			withDefaultBinaryEncoding(TestChange.codec),
			new RevisionTagCodec(new MockIdCompressor()),
			{
				jsonValidator: typeboxValidator,
			},
		);

		makeEncodingTestSuite(makeCodecFamily([[0, codec]]), testCases);

		// TODO: testing EditManagerSummarizer class itself, specifically for attachment and normal summaries.
		// TODO: format compatibility tests to detect breaking of existing documents.
	});
}
