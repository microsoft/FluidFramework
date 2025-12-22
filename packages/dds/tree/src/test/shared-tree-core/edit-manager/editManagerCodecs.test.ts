/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { ChangeEncodingContext } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeEditManagerCodecs } from "../../../shared-tree-core/editManagerCodecs.js";
import {
	EditManagerFormatVersion,
	type SharedBranchSummaryData,
	type SummaryData,
} from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	type EncodingTestData,
	makeDiscontinuedEncodingTestSuite,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import { strict as assert } from "node:assert";
import { DependentFormatVersion } from "../../../codec/index.js";

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
		const family = makeEditManagerCodecs(
			TestChange.codecs,
			DependentFormatVersion.fromUnique(1),
			testRevisionTagCodec,
			{
				jsonValidator: FormatValidatorBasic,
			},
		);
		// Versions 1 through 4 do not encode the summary originator ID.
		makeEncodingTestSuite(family, testCases, assertEquivalentSummaryDataIgnoreOriginator, [
			EditManagerFormatVersion.v3,
			EditManagerFormatVersion.v4,
		]);
		makeDiscontinuedEncodingTestSuite(family, [
			EditManagerFormatVersion.v1,
			EditManagerFormatVersion.v2,
			EditManagerFormatVersion.v5,
		]);

		makeEncodingTestSuite(family, testCases, undefined, [
			EditManagerFormatVersion.vSharedBranches,
		]);
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
