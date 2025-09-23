/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { ChangeEncodingContext } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeEditManagerCodecs } from "../../../shared-tree-core/editManagerCodecs.js";
import type { SharedBranchSummaryData, SummaryData } from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import { strict as assert } from "node:assert";

const tags = Array.from({ length: 3 }, mintRevisionTag);

const trunkCommits: SharedBranchSummaryData<TestChange>["trunk"] = [
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
		[
			"empty",
			{
				originator: dummyContext.originatorId,
				main: { trunk: [], peerLocalBranches: new Map() },
			},
			dummyContext,
		],
		[
			"single commit",
			{
				originator: dummyContext.originatorId,
				main: {
					trunk: trunkCommits.slice(0, 1),
					peerLocalBranches: new Map(),
				},
			},
			dummyContext,
		],
		[
			"multiple commits",
			{
				originator: dummyContext.originatorId,
				main: {
					trunk: trunkCommits,
					peerLocalBranches: new Map(),
				},
			},
			dummyContext,
		],
		[
			"empty branch",
			{
				originator: dummyContext.originatorId,
				main: {
					trunk: trunkCommits,
					peerLocalBranches: new Map([
						[
							"3" as SessionId,
							{
								base: tags[1],
								commits: [],
							},
						],
					]),
				},
			},
			dummyContext,
		],
		[
			"non-empty branch",
			{
				originator: dummyContext.originatorId,
				main: {
					trunk: trunkCommits,
					peerLocalBranches: new Map([
						[
							"4" as SessionId,
							{
								base: tags[1],
								commits: [
									{
										sessionId: "4" as SessionId,
										revision: mintRevisionTag(),
										change: TestChange.mint([0, 1], 4),
									},
								],
							},
						],
					]),
				},
			},
			dummyContext,
		],
		[
			"multiple branches",
			{
				originator: dummyContext.originatorId,
				main: {
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
			},
			dummyContext,
		],
	],

	// TODO: Update these failures to ensure they satisfy SummaryData<TestChange>.
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
					main: {
						trunk: trunkCommits.slice(0, 1).map((commit) => ({ ...commit, parent: 0 })),
						peerLocalBranches: [],
					},
				},
				dummyContext,
			],
		],
	},
};

export function testCodec() {
	describe("Codec", () => {
		const family = makeEditManagerCodecs(TestChange.codecs, testRevisionTagCodec, {
			jsonValidator: FormatValidatorBasic,
		});

		// Versions 1 through 4 do not encode the summary originator ID.
		makeEncodingTestSuite(
			family,
			testCases,
			assertEquivalentSummaryDataIgnoreOriginator,
			[1, 2, 3, 4],
		);

		makeEncodingTestSuite(family, testCases, undefined, [5]);

		// TODO: testing EditManagerSummarizer class itself, specifically for attachment and normal summaries.
		// TODO: format compatibility tests to detect breaking of existing documents.
	});
}

function assertEquivalentSummaryDataIgnoreOriginator(
	a: SummaryData<TestChange>,
	b: SummaryData<TestChange>,
): void {
	const aWithoutOriginator = { ...a };
	const bWithoutOriginator = { ...b };
	delete aWithoutOriginator.originator;
	delete bWithoutOriginator.originator;
	assert.deepStrictEqual(aWithoutOriginator, bWithoutOriginator);
}
