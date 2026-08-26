/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";

import { DependentFormatVersion, makeCodecFamily } from "../../../codec/index.js";
import type {
	ChangeEncodingContext,
	CustomMetadataTree,
	RevisionTag,
} from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeEditManagerCodecBuilder } from "../../../shared-tree-core/editManagerCodecs.js";
import {
	type BranchId,
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

		// These lock the permanent serialized representation of custom commit metadata in the summary. The
		// round-trip suites above only prove that the encoder and decoder agree with each other, which
		// would stay true even if the field were renamed on both sides.
		describe("custom metadata summary format", () => {
			const metadata = { kind: "edit", nested: { author: "alice", count: 3 } };
			const tree: CustomMetadataTree = { metadata, children: [] };

			/** Encodes a summary whose trunk commit and peer branch commit both carry metadata. */
			function encodeAt(version: EditManagerFormatVersion): Record<string, unknown> {
				const codec = family.resolve(version);
				const data: SummaryData<TestChange> = {
					originator: dummyContext.originatorId,
					main: {
						trunk: [
							{
								revision: tags[0],
								sessionId: "1" as SessionId,
								change: TestChange.mint([0], 1),
								sequenceNumber: brand(1),
								customMetadata: tree,
							},
						],
						peerLocalBranches: new Map([
							[
								"4" as SessionId,
								{
									base: tags[0],
									commits: [
										{
											sessionId: "4" as SessionId,
											revision: tags[1],
											change: TestChange.mint([0], 4),
											customMetadata: tree,
										},
									],
								},
							],
						]),
					},
				};
				return codec.encode(data, {
					idCompressor: testIdCompressor,
					isSummary: true,
				}) as unknown as Record<string, unknown>;
			}

			it("writes the metadata on trunk and peer branch commits at v7", () => {
				const encoded = encodeAt(EditManagerFormatVersion.v7);
				assert.equal(encoded.version, EditManagerFormatVersion.v7);
				const trunk = encoded.trunk as { customMetadata?: unknown }[];
				assert.deepEqual(trunk[0].customMetadata, { m: metadata });
				// The peer branch commits must carry it too, not just the trunk.
				const branches = encoded.branches as [
					SessionId,
					{ commits: { customMetadata?: unknown }[] },
				][];
				assert.deepEqual(branches[0][1].commits[0].customMetadata, { m: metadata });
			});

			it("omits the metadata entirely before v7", () => {
				const encoded = encodeAt(EditManagerFormatVersion.v6);
				assert.equal(encoded.version, EditManagerFormatVersion.v6);
				const trunk = encoded.trunk as { customMetadata?: unknown }[];
				assert.equal("customMetadata" in trunk[0], false);
				assert.equal(JSON.stringify(encoded).includes("alice"), false);
			});

			it("round-trips metadata through the real JSON summary form at v7", () => {
				const codec = family.resolve(EditManagerFormatVersion.v7);
				const encoded = encodeAt(EditManagerFormatVersion.v7);
				const decoded = codec.decode(JSON.parse(JSON.stringify(encoded)), {
					idCompressor: testIdCompressor,
					isSummary: true,
				});
				assert.deepEqual(decoded.main.trunk[0].customMetadata, tree);
				assert.deepEqual(
					decoded.main.peerLocalBranches.get("4" as SessionId)?.commits[0].customMetadata,
					tree,
				);
			});

			it("defines the property as undefined when decoding a summary that predates the field", () => {
				const codec = family.resolve(EditManagerFormatVersion.v6);
				const encoded = encodeAt(EditManagerFormatVersion.v6);
				const decoded = codec.decode(JSON.parse(JSON.stringify(encoded)), {
					idCompressor: testIdCompressor,
					isSummary: true,
				});
				const commit = decoded.main.trunk[0];
				assert.equal("customMetadata" in commit, true);
				assert.equal(commit.customMetadata, undefined);
			});

			it("rejects a pre-v7 summary carrying customMetadata", () => {
				// Encode at v6, then manually inject a customMetadata field into the trunk commit.
				const codec = family.resolve(EditManagerFormatVersion.v6);
				const encoded = encodeAt(EditManagerFormatVersion.v6);
				const trunk = encoded.trunk as Record<string, unknown>[];
				trunk[0] = { ...trunk[0], customMetadata: { m: { intent: "test" } } };
				assert.throws(() =>
					codec.decode(JSON.parse(JSON.stringify(encoded)), {
						idCompressor: testIdCompressor,
						isSummary: true,
					}),
				);
			});

			it("round-trips metadata on every branch of a shared branches summary", () => {
				// Shared branches have a separate codec implementation which encodes the main branch and
				// the child branches through separate calls, so each has to opt into the metadata itself.
				const codec = family.resolve(EditManagerFormatVersion.vSharedBranches);
				const childBranchId = testIdCompressor.generateCompressedId();
				const branch = (
					revision: RevisionTag,
					sessionId: SessionId,
					id?: BranchId,
				): SharedBranchSummaryData<TestChange> => ({
					id,
					trunk: [
						{
							revision,
							sessionId,
							change: TestChange.mint([0], 1),
							sequenceNumber: brand(1),
							customMetadata: tree,
						},
					],
					peerLocalBranches: new Map([
						[
							sessionId,
							{
								base: revision,
								commits: [
									{
										sessionId,
										revision: testIdCompressor.generateCompressedId(),
										change: TestChange.mint([0], 4),
										customMetadata: tree,
									},
								],
							},
						],
					]),
				});
				const data: SummaryData<TestChange> = {
					originator: dummyContext.originatorId,
					main: branch(tags[0], "1" as SessionId),
					branches: new Map([
						[childBranchId, branch(tags[1], "2" as SessionId, childBranchId)],
					]),
				};

				const encoded = codec.encode(data, {
					idCompressor: testIdCompressor,
					isSummary: true,
				});
				const decoded = codec.decode(JSON.parse(JSON.stringify(encoded)), {
					idCompressor: testIdCompressor,
					isSummary: true,
				});

				for (const summaryBranch of [decoded.main, decoded.branches?.get(childBranchId)]) {
					assert(summaryBranch !== undefined);
					assert.deepEqual(summaryBranch.trunk[0]?.customMetadata, tree);
					assert.deepEqual(
						[...summaryBranch.peerLocalBranches.values()][0]?.commits[0]?.customMetadata,
						tree,
					);
				}
			});
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
