/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	DetachedFieldIndex,
	type ForestRootId,
	makeDetachedNodeId,
	RevisionTagCodec,
} from "../../../core/index.js";
import {
	detachedFieldIndexCodecBuilder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../core/tree/detachedFieldIndexCodecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV1 } from "../../../core/tree/detachedFieldIndexFormatV1.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV2 } from "../../../core/tree/detachedFieldIndexFormatV2.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { DetachedFieldSummaryData } from "../../../core/tree/detachedFieldIndexTypes.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DetachedFieldIndexFormatVersion } from "../../../core/tree/detachedFieldIndexFormatCommon.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	type IdAllocator,
	type JsonCompatibleReadOnly,
	brand,
	idAllocatorFromMaxId,
} from "../../../util/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import {
	testIdCompressor,
	testRevisionTagCodec,
	createSnapshotCompressor,
	assertIsSessionId,
	mintRevisionTag,
} from "../../utils.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";

const mintedTag = testIdCompressor.generateCompressedId();
const finalizedTag = testIdCompressor.normalizeToOpSpace(mintedTag);

const unfinalizedIdCompressor = createIdCompressor(
	assertIsSessionId("00000000-0000-4000-b000-000000000000"),
);

const malformedData: readonly [string, JsonCompatibleReadOnly][] = [
	[
		"missing data",
		{
			version: 1,
			maxId: -1,
		},
	],
	[
		"incorrect version",
		{
			version: 999,
			data: [],
			maxId: -1,
		},
	],
	[
		"additional piece of data in entry",
		{
			version: 1,
			data: [[1, 2, 3, 4]],
			maxId: -1,
		},
	],
	[
		"incorrect data type",
		{
			version: 1,
			data: "incorrect data type",
			maxId: -1,
		},
	],
	[
		"a string",
		JSON.stringify({
			version: 1,
			data: [],
			maxId: -1,
		}),
	],
];

const validV1Data: readonly [string, FormatV1][] = [
	[
		"empty data",
		{
			version: brand(DetachedFieldIndexFormatVersion.v1),
			data: [],
			maxId: brand(-1),
		},
	],
	[
		"revision with a single entry",
		{
			version: brand(DetachedFieldIndexFormatVersion.v1),
			data: [[brand(finalizedTag), 0, brand(1)]],
			maxId: brand(-1),
		},
	],
	[
		"revision with multiple entries",
		{
			version: brand(DetachedFieldIndexFormatVersion.v1),
			data: [
				[
					brand(finalizedTag),
					[
						[1, brand(0)],
						[0, brand(1)],
					],
				],
			],
			maxId: brand(-1),
		},
	],
];
const validV2Data: readonly [string, FormatV2][] = [
	...validV1Data.map(([name, data]): [string, FormatV2] => [
		name,
		{ ...data, version: brand(DetachedFieldIndexFormatVersion.v2) },
	]),
	[
		"revision represented as a StableId",
		{
			version: brand(DetachedFieldIndexFormatVersion.v2),
			data: [[testIdCompressor.decompress(mintedTag), 0, brand(1)]],
			maxId: brand(-1),
		},
	],
];
const validData = new Map<number, readonly [string, FormatV1 | FormatV2][]>([
	[1, validV1Data],
	[2, validV2Data],
]);

interface TestCase {
	readonly name: string;
	readonly data: DetachedFieldSummaryData;
	/** The set of versions that this test case is valid for */
	readonly validFor?: ReadonlySet<number | string>;
	/** The id compressor to use for this test case */
	readonly idCompressor: IIdCompressor;
}

function generateTestCases(
	finalizedCompressor: IIdCompressor,
	unfinalizedCompressor: IIdCompressor,
): TestCase[] {
	const finalizedRevision = finalizedCompressor.generateCompressedId();
	const unfinalizedRevision = unfinalizedCompressor.generateCompressedId();
	const maxId: ForestRootId = brand(42);
	return [
		{
			name: "empty",
			data: {
				maxId,
				data: new Map(),
			},
			idCompressor: finalizedCompressor,
		},
		{
			name: "single range with single node",
			data: {
				maxId,
				data: new Map([[finalizedRevision, new Map([[0, { root: 1 }]])]]),
			},
			idCompressor: finalizedCompressor,
		},
		{
			name: "multiple nodes that do not form a single range",
			data: {
				maxId,
				data: new Map([
					[
						finalizedRevision,
						new Map([
							[2, { root: 1 }],
							[0, { root: 2 }],
							[1, { root: 4 }],
						]),
					],
				]),
			},
			idCompressor: finalizedCompressor,
		},
		{
			name: "multiple nodes that form ranges",
			data: {
				maxId,
				data: new Map([
					[
						finalizedRevision,
						new Map([
							[1, { root: 2 }],
							[3, { root: 4 }],
							[2, { root: 3 }],
							[7, { root: 6 }],
							[6, { root: 5 }],
						]),
					],
				]),
			},
			idCompressor: finalizedCompressor,
		},
		{
			name: "Unfinalized id",
			validFor: new Set([DetachedFieldIndexFormatVersion.v2]),
			data: {
				maxId,
				data: new Map([[unfinalizedRevision, new Map([[0, { root: brand(1) }]])]]),
			},
			idCompressor: unfinalizedCompressor,
		},
	];
}

function makeDetachedFieldIndex(): DetachedFieldIndex {
	return new DetachedFieldIndex(
		"test",
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		testRevisionTagCodec,
		testIdCompressor,
	);
}

describe("DetachedFieldIndex Codecs", () => {
	const options: CodecWriteOptions = {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_0,
	};

	it("encodes with a version stamp.", () => {
		const detachedFieldIndex = new DetachedFieldIndex(
			"test",
			idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
			testRevisionTagCodec,
			testIdCompressor,
			options,
		);
		const expected = {
			version: 1,
			data: [],
			maxId: -1,
		};
		assert.deepEqual(detachedFieldIndex.encode(), expected);
	});

	describe("round-trip through JSON", () => {
		for (const { name, data, idCompressor, validFor } of generateTestCases(
			testIdCompressor,
			unfinalizedIdCompressor,
		)) {
			describe(name, () => {
				for (const codec of detachedFieldIndexCodecBuilder.registry.values()) {
					if (
						validFor !== undefined &&
						codec.formatVersion !== undefined &&
						!validFor.has(codec.formatVersion)
					) {
						continue;
					}
					it(`version ${codec.formatVersion}`, () => {
						const inner = codec.codec({
							...options,
							revisionTagCodec: new RevisionTagCodec(idCompressor),
							idCompressor,
						});
						const encoded = inner.encode(data);
						const decoded = inner.decode(encoded);
						assert.deepEqual(decoded, data);
					});
				}
			});
		}
	});
	describe("loadData", () => {
		const codec = detachedFieldIndexCodecBuilder.build({
			...options,
			revisionTagCodec: testRevisionTagCodec,
			idCompressor: testIdCompressor,
		});
		for (const [version, cases] of validData) {
			describe(`accepts correct version ${version} data`, () => {
				for (const [name, data] of cases) {
					it(name, () => {
						codec.decode(data);
					});
				}
			});
		}
		describe("throws on receiving malformed data", () => {
			for (const [name, data] of malformedData) {
				it(name, () => {
					assert.throws(
						() => codec.decode(data),
						"Expected malformed data to throw an error on decode, but it did not.",
					);
				});
			}
		});
	});
	describe("Snapshots", () => {
		const snapshotIdCompressor = createSnapshotCompressor();
		for (const { name, data, idCompressor, validFor } of generateTestCases(
			snapshotIdCompressor,
			unfinalizedIdCompressor,
		)) {
			describe(name, () => {
				for (const format of detachedFieldIndexCodecBuilder.registry.values()) {
					const version = format.formatVersion;
					if (validFor !== undefined && version !== undefined && !validFor.has(version)) {
						continue;
					}
					const dir = path.join("detached-field-index", name);
					useSnapshotDirectory(dir);
					it(`version ${version}`, () => {
						const codec = format.codec({
							...options,
							revisionTagCodec: new RevisionTagCodec(idCompressor),
							idCompressor,
						});
						const encoded = codec.encode(data);
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
});

describe("DetachedFieldIndex methods", () => {
	describe("createEntry", () => {
		it("can retrieve entries after creating", () => {
			const detachedIndex = makeDetachedFieldIndex();
			const revisionTag1 = mintRevisionTag();
			const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);

			const revisionTag2 = mintRevisionTag();
			const rootId = detachedIndex.createEntry(detachedNodeId1, revisionTag2);

			const revisionTag3 = mintRevisionTag();
			const detachedNodeId2 = makeDetachedNodeId(revisionTag3, 2);
			assert.equal(detachedIndex.tryGetEntry(detachedNodeId1), rootId);
			assert.equal(detachedIndex.getEntry(detachedNodeId1), rootId);
			assert.equal(detachedIndex.tryGetEntry(detachedNodeId2), undefined);
			assert.throws(() => detachedIndex.getEntry(detachedNodeId2));
		});

		it("creates multiple rootIds and minorIds when count > 1 is passed in", () => {
			const detachedIndex = makeDetachedFieldIndex();
			const revisionTag1 = mintRevisionTag();
			const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);

			const revisionTag2 = mintRevisionTag();
			detachedIndex.createEntry(detachedNodeId1, revisionTag2, 2);

			const rootIds = [...detachedIndex.getRootsLastTouchedByRevision(revisionTag2)];
			assert.equal(rootIds.length, 2);

			const entries = [...detachedIndex.entries()];
			assert.deepEqual(entries, [
				{ root: rootIds[0], latestRelevantRevision: revisionTag2, id: detachedNodeId1 },
				{
					root: rootIds[1],
					latestRelevantRevision: revisionTag2,
					id: { major: detachedNodeId1.major, minor: detachedNodeId1.minor + 1 },
				},
			]);
		});
	});

	it("entries returns all created entries", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);
		const detachedNodeId2 = makeDetachedNodeId(undefined, 2);

		const revisionTag2 = mintRevisionTag();
		const rootId1 = detachedIndex.createEntry(detachedNodeId1, revisionTag2);
		const rootId2 = detachedIndex.createEntry(detachedNodeId2, revisionTag2, 2);

		const entries = [...detachedIndex.entries()];
		assert.deepEqual(entries, [
			{ root: rootId1, latestRelevantRevision: revisionTag2, id: detachedNodeId1 },
			{ root: rootId2, latestRelevantRevision: revisionTag2, id: detachedNodeId2 },
			{
				root: rootId2 + 1,
				latestRelevantRevision: revisionTag2,
				id: makeDetachedNodeId(undefined, 3),
			},
		]);
	});

	it("deleteRootsLastTouchedByRevision removes entries", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);
		const detachedNodeId2 = makeDetachedNodeId(revisionTag1, 2);

		const revisionTag2 = mintRevisionTag();
		detachedIndex.createEntry(detachedNodeId1, revisionTag2);
		detachedIndex.createEntry(detachedNodeId2, revisionTag2, 2);

		const revisionTag3 = mintRevisionTag();
		const detachedNodeId3 = makeDetachedNodeId(revisionTag1, 4);
		const undeletedRootId = detachedIndex.createEntry(detachedNodeId3, revisionTag3);

		detachedIndex.deleteRootsLastTouchedByRevision(revisionTag2);
		assert.equal(detachedIndex.tryGetEntry(detachedNodeId1), undefined);
		assert.equal(detachedIndex.tryGetEntry(detachedNodeId2), undefined);
		assert.equal(detachedIndex.tryGetEntry(makeDetachedNodeId(revisionTag1, 3)), undefined);
		assert.equal(detachedIndex.tryGetEntry(detachedNodeId3), undeletedRootId);
	});

	it("deleteRootsLastTouchedByRevision for an unknown revision does not throw", () => {
		const detachedIndex = makeDetachedFieldIndex();
		const revisionTag1 = mintRevisionTag();
		assert.doesNotThrow(() => detachedIndex.deleteRootsLastTouchedByRevision(revisionTag1));
	});

	it("deleteEntry removes single entry, and throws if entry does not exist", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);

		const revisionTag2 = mintRevisionTag();
		detachedIndex.createEntry(detachedNodeId1, revisionTag2);

		detachedIndex.deleteEntry(detachedNodeId1);
		assert.equal(detachedIndex.tryGetEntry(detachedNodeId1), undefined);
		assert.throws(() => detachedIndex.deleteEntry(detachedNodeId1));
	});

	it("purge removes all entries", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId1 = makeDetachedNodeId(revisionTag1, 1);
		const detachedNodeId2 = makeDetachedNodeId(revisionTag1, 2);

		const revisionTag2 = mintRevisionTag();
		detachedIndex.createEntry(detachedNodeId1, revisionTag2);
		detachedIndex.createEntry(detachedNodeId2, revisionTag2);

		detachedIndex.purge();
		assert.equal([...detachedIndex.entries()].length, 0);
	});

	it("loadData preserves maxId and entries, and sets latestRelevantRevision to undefined.", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId = makeDetachedNodeId(revisionTag1, 1);

		const revisionTag2 = mintRevisionTag();
		const rootId = detachedIndex.createEntry(detachedNodeId, revisionTag2);

		const encodedDetachedIndex = detachedIndex.encode();

		const detachedIndex2 = makeDetachedFieldIndex();
		detachedIndex2.loadData(encodedDetachedIndex);
		assert.equal(detachedIndex2.tryGetEntry(detachedNodeId), rootId);

		// Check that loadData set the latestRelevantRevision to undefined.
		assert.equal([...detachedIndex2.entries()][0].latestRelevantRevision, undefined);

		// Check that the maxId is preserved, and doesn't reset
		const emptyId = detachedIndex2.createEntry(undefined, undefined);
		assert.equal(rootId + 1, emptyId);
	});

	it("setRevisionsForLoadedData sets latestRelevantRevision, and throws if called more than once.", () => {
		const detachedIndex = makeDetachedFieldIndex();

		const revisionTag1 = mintRevisionTag();
		const detachedNodeId = makeDetachedNodeId(revisionTag1, 1);

		const revisionTag2 = mintRevisionTag();
		const rootId = detachedIndex.createEntry(detachedNodeId, revisionTag2);

		const encodedDetachedIndex = detachedIndex.encode();

		const detachedIndex2 = makeDetachedFieldIndex();
		detachedIndex2.loadData(encodedDetachedIndex);
		assert.equal(detachedIndex2.tryGetEntry(detachedNodeId), rootId);

		// Sets the new revision tag after loading
		const revisionTag3 = mintRevisionTag();
		detachedIndex2.setRevisionsForLoadedData(revisionTag3);
		assert.equal([...detachedIndex2.entries()][0].latestRelevantRevision, revisionTag3);
		// Check that it was last touched by revisionTag3
		assert.deepEqual(
			[...detachedIndex2.getRootsLastTouchedByRevision(revisionTag3)],
			[rootId],
		);

		// Throws if setRevisionsForLoadedData is called more than once.
		assert.throws(() => detachedIndex2.setRevisionsForLoadedData(mintRevisionTag()));
	});

	describe("getRootsLastTouchedByRevision", () => {
		it("returns rootId, but doesn't work with old revision after calling updateLatestRevision.", () => {
			const detachedIndex = makeDetachedFieldIndex();

			const revisionTag1 = mintRevisionTag();
			const detachedNodeId = makeDetachedNodeId(revisionTag1, 1);

			const revisionTag2 = mintRevisionTag();
			const rootId = detachedIndex.createEntry(detachedNodeId, revisionTag2);
			assert.deepEqual(
				[...detachedIndex.getRootsLastTouchedByRevision(revisionTag2)],
				[rootId],
			);

			const revisionTag3 = mintRevisionTag();
			detachedIndex.updateLatestRevision(detachedNodeId, revisionTag3);
			assert.deepEqual(
				[...detachedIndex.getRootsLastTouchedByRevision(revisionTag3)],
				[rootId],
			);
			assert.deepEqual([...detachedIndex.getRootsLastTouchedByRevision(revisionTag2)], []);
		});
	});

	it("clone copies the maxId and detachedIndex contents, and changes to clone does not affect the original.", () => {
		const detachedIndex = makeDetachedFieldIndex();
		const revisionTag1 = mintRevisionTag();
		const detachedNodeId = makeDetachedNodeId(revisionTag1, 1);

		const revisionTag2 = mintRevisionTag();
		const rootId = detachedIndex.createEntry(detachedNodeId, revisionTag2);

		const detachedIndexClone = detachedIndex.clone();
		assert.equal(detachedIndexClone.tryGetEntry(detachedNodeId), rootId);

		// To check if the maxId from original is preserved
		const emptyId = detachedIndexClone.createEntry(undefined, undefined);
		assert.equal(emptyId, rootId + 1);

		// Check that changes to the clone does not affect the original
		detachedIndexClone.deleteEntry(detachedNodeId);
		assert.equal(detachedIndexClone.tryGetEntry(detachedNodeId), undefined);
		assert.equal(detachedIndex.tryGetEntry(detachedNodeId), rootId);
	});

	it("toFieldKey created different field keys for different root ids", () => {
		const detachedIndex = makeDetachedFieldIndex();
		const revisionTag1 = mintRevisionTag();
		const detachedNodeId = makeDetachedNodeId(revisionTag1, 1);
		const detachedNodeId2 = makeDetachedNodeId(revisionTag1, 2);
		const rootId = detachedIndex.createEntry(detachedNodeId);
		const rootId2 = detachedIndex.createEntry(detachedNodeId2);
		assert.notEqual(detachedIndex.toFieldKey(rootId), detachedIndex.toFieldKey(rootId2));
	});

	describe("checkpoints", () => {
		it("invoking a checkpoint restores the index state", () => {
			const index = makeDetachedFieldIndex();
			const revisionTag1 = mintRevisionTag();
			index.createEntry(makeDetachedNodeId(revisionTag1, 1));

			const originalData = index.encode();
			const restore = index.createCheckpoint();

			// Make changes to the index
			index.deleteEntry(makeDetachedNodeId(revisionTag1, 1));
			index.createEntry(makeDetachedNodeId(revisionTag1, 2), revisionTag1);
			assert.notDeepEqual(index.encode(), originalData);

			restore();
			assert.deepEqual(index.encode(), originalData);
		});

		it("multiple checkpoints can exist for the same index", () => {
			const index = makeDetachedFieldIndex();
			const revisionTag1 = mintRevisionTag();
			index.createEntry(makeDetachedNodeId(revisionTag1, 1));

			const originalData = index.encode();
			const restore1 = index.createCheckpoint();

			// Make changes to the index
			index.deleteEntry(makeDetachedNodeId(revisionTag1, 1));
			index.createEntry(makeDetachedNodeId(revisionTag1, 2), revisionTag1);
			assert.notDeepEqual(index.encode(), originalData);

			const changedData = index.encode();
			const restore2 = index.createCheckpoint();

			restore1();
			assert.deepEqual(index.encode(), originalData);

			restore2();
			assert.deepEqual(index.encode(), changedData);
		});

		it("a checkpoint can be restored multiple times", () => {
			const index = makeDetachedFieldIndex();
			const revisionTag1 = mintRevisionTag();
			index.createEntry(makeDetachedNodeId(revisionTag1, 1));

			const originalData = index.encode();
			const restore = index.createCheckpoint();

			// Make changes to the index
			index.deleteEntry(makeDetachedNodeId(revisionTag1, 1));
			index.createEntry(makeDetachedNodeId(revisionTag1, 2), revisionTag1);
			assert.notDeepEqual(index.encode(), originalData);

			restore();
			assert.deepEqual(index.encode(), originalData);

			// Make more changes to the index
			index.createEntry(makeDetachedNodeId(revisionTag1, 3), revisionTag1);
			assert.notDeepEqual(index.encode(), originalData);

			restore();
			assert.deepEqual(index.encode(), originalData);
		});
	});
});
