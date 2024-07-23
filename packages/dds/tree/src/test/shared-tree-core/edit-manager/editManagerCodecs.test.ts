/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { ChangeEncodingContext } from "../../../core/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeEditManagerCodecs } from "../../../shared-tree-core/editManagerCodecs.js";
import type { SummaryData } from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
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

// Dummy context object created to pass through the codec.
const dummyContext = {
	originatorId: "dummySessionID" as SessionId,
	revision: undefined,
	idCompressor: testIdCompressor,
};
const testCases: EncodingTestData<SummaryData<TestChange>, unknown, ChangeEncodingContext> = {
	successes: [
		["empty", { trunk: [], peerLocalBranches: new Map() }, dummyContext],
		[
			"single commit",
			{
				trunk: trunkCommits.slice(0, 1),
				peerLocalBranches: new Map(),
			},
			dummyContext,
		],
		[
			"multiple commits",
			{
				trunk: trunkCommits,
				peerLocalBranches: new Map(),
			},
			dummyContext,
		],
		[
			"empty branch",
			{
				trunk: trunkCommits,
				peerLocalBranches: new Map([
					[
						"3",
						{
							base: tags[1],
							commits: [],
						},
					],
				]),
			},
			dummyContext,
		],
		[
			"non-empty branch",
			{
				trunk: trunkCommits,
				peerLocalBranches: new Map([
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
			dummyContext,
		],
		[
			"multiple branches",
			{
				trunk: trunkCommits,
				peerLocalBranches: new Map([
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
			dummyContext,
		],
	],
	failures: {
		1: [
			[
				"missing revision",
				{
					base: tags[0],
					commits: [{ sessionId: "4", change: TestChange.mint([0], 1) }],
				},
				dummyContext,
			],
			[
				"missing sessionId",
				{
					base: tags[0],
					commits: [{ change: TestChange.mint([0], 1), revision: mintRevisionTag() }],
				},
				dummyContext,
			],
			["non-object", "", dummyContext],
			[
				"commit with parent field",
				{
					trunk: trunkCommits.slice(0, 1).map((commit) => ({ ...commit, parent: 0 })),
					branches: [],
				},
				dummyContext,
			],
		],
	},
};

export function testCodec() {
	describe("Codec", () => {
		const family = makeEditManagerCodecs(TestChange.codecs, testRevisionTagCodec, {
			jsonValidator: typeboxValidator,
		});

		makeEncodingTestSuite(family, testCases);

		// TODO: testing EditManagerSummarizer class itself, specifically for attachment and normal summaries.
		// TODO: format compatibility tests to detect breaking of existing documents.
	});
}
