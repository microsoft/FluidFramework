/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";

import { DependentFormatVersion, makeCodecFamily } from "../../../codec/index.js";
import type { ChangeEncodingContext } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeEditManagerCodecBuilder } from "../../../shared-tree-core/editManagerCodecs.js";
import {
	EditManagerFormatVersion,
	supportedEditManagerFormatVersions,
	type Commit,
	type SequencedCommit,
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

const tags = Array.from({ length: 3 }, mintRevisionTag);

const trunkCommits: SharedBranchSummaryData<TestChange>["trunk"] = [
	{
		revision: tags[0],
		sessionId: "1" as SessionId,
		change: TestChange.mint([0], 1),
		sequenceNumber: brand(1),
		// Decoding always defines this property, so the fixtures must too for deep equality to hold.
		customMetadata: undefined,
	},
	{
		revision: tags[1],
		sessionId: "2" as SessionId,
		change: TestChange.mint([0, 1], 2),
		sequenceNumber: brand(2),
		customMetadata: undefined,
	},
	{
		revision: tags[2],
		sessionId: "1" as SessionId,
		change: TestChange.mint([0, 1, 2], 3),
		sequenceNumber: brand(3),
		customMetadata: undefined,
	},
];

// Dummy context object created to pass through the codec.
const dummyContext = {
	originatorId: "dummySessionID" as SessionId,
	isSummary: false,
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
										customMetadata: undefined,
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
										customMetadata: undefined,
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

export function testCodec(): void {
	describe("Codec", () => {
		const builder = makeEditManagerCodecBuilder<TestChange>();
		const built = builder.applyOptions({
			changeCodecs: TestChange.codecs,
			dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
			revisionTagCodec: testRevisionTagCodec,
			jsonValidator: FormatValidatorBasic,
		});
		const family = makeCodecFamily(
			built.map((codec) => [codec.formatVersion, codec.codec] as const),
		);
		// Non "vSharedBranches" versions do not encode the summary originatorId.
		makeEncodingTestSuite(family, testCases, assertEquivalentSummaryDataIgnoreOriginator, [
			EditManagerFormatVersion.v3,
			EditManagerFormatVersion.v4,
			EditManagerFormatVersion.v6,
			EditManagerFormatVersion.v7,
		]);
		makeDiscontinuedEncodingTestSuite(family, [
			EditManagerFormatVersion.v1,
			EditManagerFormatVersion.v2,
			EditManagerFormatVersion.v5,
		]);

		makeEncodingTestSuite(family, testCases, undefined, [
			EditManagerFormatVersion.vSharedBranches,
		]);

		it("Extra properties on commits are omitted from encoding", () => {
			interface ExtraData {
				"☠️": "☠️";
			}
			const trunkCommit = {
				revision: tags[0],
				sessionId: "1" as SessionId,
				change: TestChange.mint([0], 1),
				sequenceNumber: brand(1),
				customMetadata: undefined,
				"☠️": "☠️",
			} satisfies SequencedCommit<TestChange> & ExtraData;
			const branchCommit = {
				sessionId: "4" as SessionId,
				revision: mintRevisionTag(),
				change: TestChange.mint([0, 1], 4),
				customMetadata: undefined,
				"☠️": "☠️",
			} satisfies Commit<TestChange> & ExtraData;
			const data = {
				originator: dummyContext.originatorId,
				main: {
					trunk: [trunkCommit],
					peerLocalBranches: new Map([
						[
							"4" as SessionId,
							{
								base: tags[1],
								commits: [branchCommit],
							},
						],
					]),
				},
			} satisfies SummaryData<TestChange>;
			for (const version of supportedEditManagerFormatVersions) {
				const codec = family.resolve(version);
				// So long as we keep validating encoded data against the schema,
				// this invocation should throw if extra properties are not filtered out during encoding.
				const encoded = codec.encode(data, dummyContext);
				const stringified = JSON.stringify(encoded);
				// This assert added as redundant check in case we stop validating encoded data against the schema
				// or in case the schema is relaxed by mistake (e.g., using `CommitBase` instead of `Commit`, which allows extra properties).
				assert(
					!stringified.includes("☠️"),
					"Extra properties should be filtered out during encoding",
				);
			}
		});

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
