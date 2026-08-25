/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";
import { createSessionId } from "@fluidframework/id-compressor/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	currentVersion,
	DependentFormatVersion,
	FluidClientVersion,
	makeCodecFamily,
} from "../../codec/index.js";
import type {
	EncodedRevisionTag,
	GraphCommit,
	ChangeEncodingContext,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import { MessageFormatVersion } from "../../shared-tree-core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeMessageCodecBuilder } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
import { TestChange } from "../testChange.js";
import {
	type EncodingTestData,
	makeDiscontinuedEncodingTestSuite,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../utils.js";

const commit1 = {
	revision: mintRevisionTag(),
	change: TestChange.mint([], 0),
	persistedMetadata: undefined,
};

const commit2 = {
	revision: mintRevisionTag(),
	change: TestChange.mint([0], [1, 2, 3]),
	persistedMetadata: undefined,
};

const commitWithoutRevision = {
	change: TestChange.mint([], 0),
};

const commitWithoutChange = {
	revision: mintRevisionTag(),
};

const commitInvalid = {
	revision: 1,
	change: "Invalid change",
};

const dummyContext = {
	originatorId: testIdCompressor.localSessionId,
	isSummary: false,
	revision: undefined,
	idCompressor: testIdCompressor,
};
const testCases: EncodingTestData<
	DecodedMessage<TestChange>,
	unknown,
	ChangeEncodingContext
> = {
	successes: [
		[
			"Message with commit 1",
			{
				type: "commit",
				sessionId: testIdCompressor.localSessionId,
				commit: commit1,
				branchId: "main",
			},
			dummyContext,
		],
		[
			"Message with commit 2",
			{
				type: "commit",
				sessionId: testIdCompressor.localSessionId,
				commit: commit2,
				branchId: "main",
			},
			dummyContext,
		],
	],
	failures: {
		1: [
			["Empty message", {}, dummyContext],
			[
				"Missing sessionId",
				{
					type: "commit",
					commit: commit1,
					branchId: "main",
				},
				dummyContext,
			],
			[
				"Missing commit",
				{
					type: "commit",
					sessionId: "session1",
					branchId: "main",
				},
				dummyContext,
			],
			[
				"Message with invalid sessionId",
				{
					type: "commit",
					sessionId: 1,
					commit: commit1,
					branchId: "main",
				},
				dummyContext,
			],
			[
				"Message with commit without revision",
				{
					type: "commit",
					sessionId: "session1",
					commit: commitWithoutRevision,
					branchId: "main",
				},
				dummyContext,
			],
			[
				"Message with invalid commit",
				{
					type: "commit",
					sessionId: "session1",
					commit: commitInvalid,
					branchId: "main",
				},
				dummyContext,
			],
		],
	},
};

describe("message codec", () => {
	const builder = makeMessageCodecBuilder<TestChange>();
	const built = builder.applyOptions({
		changeCodecs: TestChange.codecs,
		dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
		revisionTagCodec: testRevisionTagCodec,
		jsonValidator: FormatValidatorBasic,
	});
	const family = makeCodecFamily(
		built.map((codec) => [codec.formatVersion, codec.codec] as const),
	);
	makeEncodingTestSuite(family, testCases, undefined, [
		MessageFormatVersion.v3,
		MessageFormatVersion.v4,
		MessageFormatVersion.v6,
		MessageFormatVersion.v7,
		MessageFormatVersion.vSharedBranches,
	]);
	makeDiscontinuedEncodingTestSuite(family, [
		undefined,
		MessageFormatVersion.v1,
		MessageFormatVersion.v2,
		MessageFormatVersion.v5,
	]);

	describe("dispatching codec", () => {
		const codec = makeMessageCodecBuilder<TestChange>().build({
			changeCodecs: TestChange.codecs,
			dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
			revisionTagCodec: testRevisionTagCodec,
			jsonValidator: FormatValidatorBasic,
			minVersionForCollab: currentVersion,
		});

		const sessionId: SessionId = "sessionId" as SessionId;
		it("Drops parent commit fields on encode", () => {
			const revision = testIdCompressor.generateCompressedId();
			const message: DecodedMessage<TestChange> = {
				type: "commit",
				sessionId,
				commit: {
					revision,
					change: TestChange.mint([], 1),
					parent: "Extra field that should be dropped" as unknown as GraphCommit<TestChange>,
					persistedMetadata: undefined,
				},
				branchId: "main",
			};

			const actual = codec.decode(codec.encode(message, { idCompressor: testIdCompressor }), {
				idCompressor: testIdCompressor,
			});
			assert.deepEqual(actual, {
				type: "commit",
				branchId: "main",
				sessionId,
				commit: {
					revision,
					change: TestChange.mint([], 1),
					persistedMetadata: undefined,
				},
			});
		});

		it("rejects messages with invalid versions", () => {
			const revision = 1 as EncodedRevisionTag;
			const originatorId = createSessionId();
			const encoded = JSON.stringify({
				revision,
				originatorId,
				changeset: {},
				version: -1,
			});
			assert.throws(
				() => codec.decode(JSON.parse(encoded), { idCompressor: testIdCompressor }),
				validateUsageError(/Unsupported version -1 encountered while decoding Message data./),
			);
		});
	});

	// These lock the permanent serialized representation of persisted commit metadata. The round-trip
	// suites above only prove that the current encoder and decoder agree with each other, which would
	// stay true if the field were renamed on both sides — but that would silently orphan the metadata in
	// documents already written at v7.
	describe("persisted metadata wire format", () => {
		const sessionId: SessionId = "sessionId" as SessionId;
		const metadata = { kind: "edit", nested: { author: "alice", count: 3 } };

		function encodeAt(
			minVersionForCollab: (typeof FluidClientVersion)[keyof typeof FluidClientVersion],
		): Record<string, unknown> {
			const codec = makeMessageCodecBuilder<TestChange>().build({
				changeCodecs: TestChange.codecs,
				dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
				revisionTagCodec: testRevisionTagCodec,
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab,
			});
			const message: DecodedMessage<TestChange> = {
				type: "commit",
				sessionId,
				commit: {
					revision: testIdCompressor.generateCompressedId(),
					change: TestChange.mint([], 1),
					persistedMetadata: metadata,
				},
				branchId: "main",
			};
			return codec.encode(message, { idCompressor: testIdCompressor }) as unknown as Record<
				string,
				unknown
			>;
		}

		it("writes the metadata under the 'persistedMetadata' key at v7", () => {
			const encoded = encodeAt(FluidClientVersion.v3_0);
			assert.equal(encoded.version, MessageFormatVersion.v7);
			assert.deepEqual(encoded.persistedMetadata, metadata);
			// Guard against the value being nested under some other key instead.
			assert.equal(
				JSON.stringify(encoded).includes(`"persistedMetadata":`),
				true,
				"The encoded op must carry the metadata under its documented key",
			);
		});

		it("omits the metadata entirely before v7", () => {
			const encoded = encodeAt(FluidClientVersion.v2_80);
			assert.equal(encoded.version, MessageFormatVersion.v6);
			assert.equal("persistedMetadata" in encoded, false);
			assert.equal(JSON.stringify(encoded).includes("alice"), false);
		});

		it("round-trips a nested metadata object through the real JSON wire form at v7", () => {
			const encoded = encodeAt(FluidClientVersion.v3_0);
			const codec = makeMessageCodecBuilder<TestChange>().build({
				changeCodecs: TestChange.codecs,
				dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
				revisionTagCodec: testRevisionTagCodec,
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v3_0,
			});
			// Go through an actual JSON round trip rather than passing the in-memory object along.
			const decoded = codec.decode(JSON.parse(JSON.stringify(encoded)), {
				idCompressor: testIdCompressor,
			});
			assert(decoded.type === "commit");
			assert.deepEqual(decoded.commit.persistedMetadata, metadata);
		});
	});
});
