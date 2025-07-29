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
	RevisionTagCodec,
} from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import {
	makeDetachedFieldIndexCodec,
	makeDetachedFieldIndexCodecFamily,
} from "../../../core/tree/detachedFieldIndexCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import type { FormatV1 } from "../../../core/tree/detachedFieldIndexFormatV1.js";
// eslint-disable-next-line import/no-internal-modules
import { version2, type FormatV2 } from "../../../core/tree/detachedFieldIndexFormatV2.js";
// eslint-disable-next-line import/no-internal-modules
import type { DetachedFieldSummaryData } from "../../../core/tree/detachedFieldIndexTypes.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
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
			version: 1,
			data: [],
			maxId: brand(-1),
		},
	],
	[
		"revision with a single entry",
		{
			version: 1,
			data: [[brand(finalizedTag), 0, brand(1)]],
			maxId: brand(-1),
		},
	],
	[
		"revision with multiple entries",
		{
			version: 1,
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
	...validV1Data.map(([name, data]): [string, FormatV2] => [name, { ...data, version: 2 }]),
	[
		"revision represented as a StableId",
		{
			version: 2,
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
	readonly validFor?: ReadonlySet<number>;
	/** The id compressor to use for this test case */
	readonly idCompressor: IIdCompressor;
}

function generateTestCases(
	finalizedIdCompressor: IIdCompressor,
	unfinalizedIdCompressor: IIdCompressor,
): TestCase[] {
	const finalizedRevision = finalizedIdCompressor.generateCompressedId();
	const unfinalizedRevision = unfinalizedIdCompressor.generateCompressedId();
	const maxId: ForestRootId = brand(42);
	return [
		{
			name: "empty",
			data: {
				maxId,
				data: new Map(),
			},
			idCompressor: finalizedIdCompressor,
		},
		{
			name: "single range with single node",
			data: {
				maxId,
				data: new Map([[finalizedRevision, new Map([[0, { root: 1 }]])]]),
			},
			idCompressor: finalizedIdCompressor,
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
			idCompressor: finalizedIdCompressor,
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
			idCompressor: finalizedIdCompressor,
		},
		{
			name: "Unfinalized id",
			validFor: new Set([version2]),
			data: {
				maxId,
				data: new Map([[unfinalizedRevision, new Map([[0, { root: brand(1) }]])]]),
			},
			idCompressor: unfinalizedIdCompressor,
		},
	];
}

describe("DetachedFieldIndex Codecs", () => {
	const options: CodecWriteOptions = {
		jsonValidator: typeboxValidator,
		oldestCompatibleClient: FluidClientVersion.v2_0,
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
				const family = makeDetachedFieldIndexCodecFamily(
					new RevisionTagCodec(idCompressor),
					options,
					idCompressor,
				);
				for (const version of family.getSupportedFormats()) {
					if (validFor !== undefined && version !== undefined && !validFor.has(version)) {
						continue;
					}
					it(`version ${version}`, () => {
						const codec = family.resolve(version);
						const encoded = codec.json.encode(data);
						const decoded = codec.json.decode(encoded);
						assert.deepEqual(decoded, data);
					});
				}
			});
		}
	});
	describe("loadData", () => {
		const codec = makeDetachedFieldIndexCodec(testRevisionTagCodec, options, testIdCompressor);
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
				const family = makeDetachedFieldIndexCodecFamily(
					new RevisionTagCodec(idCompressor),
					options,
					idCompressor,
				);
				for (const version of family.getSupportedFormats()) {
					if (validFor !== undefined && version !== undefined && !validFor.has(version)) {
						continue;
					}
					const dir = path.join("detached-field-index", name, `V${version}`);
					useSnapshotDirectory(dir);
					it(`version ${version}`, () => {
						const codec = family.resolve(version);
						const encoded = codec.json.encode(data);
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
});
