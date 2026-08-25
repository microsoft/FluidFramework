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
	CustomMetadataTree,
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
	customMetadata: undefined,
};

const commit2 = {
	revision: mintRevisionTag(),
	change: TestChange.mint([0], [1, 2, 3]),
	customMetadata: undefined,
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
					customMetadata: undefined,
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
					customMetadata: undefined,
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

	// These lock the permanent serialized representation of custom commit metadata. The round-trip
	// suites above only prove that the current encoder and decoder agree with each other, which would
	// stay true if the field were renamed on both sides — but that would silently orphan the metadata in
	// documents already written at v7.
	describe("custom metadata wire format", () => {
		const sessionId: SessionId = "sessionId" as SessionId;
		const metadata = { kind: "edit", nested: { author: "alice", count: 3 } };
		const innerMetadata = { subsystem: "layout" };

		function makeCodec(
			minVersionForCollab: (typeof FluidClientVersion)[keyof typeof FluidClientVersion],
		) {
			return makeMessageCodecBuilder<TestChange>().build({
				changeCodecs: TestChange.codecs,
				dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
				revisionTagCodec: testRevisionTagCodec,
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab,
			});
		}

		function encodeAt(
			minVersionForCollab: (typeof FluidClientVersion)[keyof typeof FluidClientVersion],
			customMetadata: CustomMetadataTree,
		): Record<string, unknown> {
			const message: DecodedMessage<TestChange> = {
				type: "commit",
				sessionId,
				commit: {
					revision: testIdCompressor.generateCompressedId(),
					change: TestChange.mint([], 1),
					customMetadata,
				},
				branchId: "main",
			};
			return makeCodec(minVersionForCollab).encode(message, {
				idCompressor: testIdCompressor,
			}) as unknown as Record<string, unknown>;
		}

		it("writes an un-nested tree as just the abbreviated metadata key at v7", () => {
			const encoded = encodeAt(FluidClientVersion.v3_0, { metadata, children: [] });
			assert.equal(encoded.version, MessageFormatVersion.v7);
			// The common (un-nested) case must not pay for the empty child list.
			assert.deepEqual(encoded.customMetadata, { m: metadata });
		});

		it("writes nested transactions under the abbreviated children key at v7", () => {
			const encoded = encodeAt(FluidClientVersion.v3_0, {
				metadata,
				children: [{ metadata: innerMetadata, children: [] }],
			});
			assert.deepEqual(encoded.customMetadata, {
				m: metadata,
				c: [{ m: innerMetadata }],
			});
		});

		it("omits a node's metadata key when that transaction supplied none", () => {
			const encoded = encodeAt(FluidClientVersion.v3_0, {
				metadata: undefined,
				children: [{ metadata: innerMetadata, children: [] }],
			});
			assert.deepEqual(encoded.customMetadata, { c: [{ m: innerMetadata }] });
		});

		it("omits the metadata entirely before v7", () => {
			const encoded = encodeAt(FluidClientVersion.v2_80, { metadata, children: [] });
			assert.equal(encoded.version, MessageFormatVersion.v6);
			assert.equal("customMetadata" in encoded, false);
			// Also check the value did not leak out under some other key.
			assert.equal(JSON.stringify(encoded).includes("alice"), false);
		});

		it("round-trips a nested tree through the real JSON wire form at v7", () => {
			const tree: CustomMetadataTree = {
				metadata,
				children: [{ metadata: innerMetadata, children: [] }],
			};
			const encoded = encodeAt(FluidClientVersion.v3_0, tree);
			// Go through an actual JSON round trip rather than passing the in-memory object along.
			const decoded = makeCodec(FluidClientVersion.v3_0).decode(
				JSON.parse(JSON.stringify(encoded)),
				{ idCompressor: testIdCompressor },
			);
			assert(decoded.type === "commit");
			assert.deepEqual(decoded.commit.customMetadata, tree);
		});

		it("round-trips a nested tree through the shared branches format", () => {
			// Shared branches have a separate codec implementation, so it can drift from the one above.
			const codec = makeCodecFamily(
				makeMessageCodecBuilder<TestChange>()
					.applyOptions({
						changeCodecs: TestChange.codecs,
						dependentChangeFormatVersion: DependentFormatVersion.fromUnique(1),
						revisionTagCodec: testRevisionTagCodec,
						jsonValidator: FormatValidatorBasic,
					})
					.map((c) => [c.formatVersion, c.codec] as const),
			).resolve(MessageFormatVersion.vSharedBranches);
			const tree: CustomMetadataTree = {
				metadata,
				children: [{ metadata: innerMetadata, children: [] }],
			};
			const message: DecodedMessage<TestChange> = {
				type: "commit",
				sessionId,
				commit: {
					revision: testIdCompressor.generateCompressedId(),
					change: TestChange.mint([], 1),
					customMetadata: tree,
				},
				branchId: "main",
			};
			const encoded = codec.encode(message, { idCompressor: testIdCompressor });
			assert.deepEqual((encoded as unknown as Record<string, unknown>).customMetadata, {
				m: metadata,
				c: [{ m: innerMetadata }],
			});
			const decoded = codec.decode(JSON.parse(JSON.stringify(encoded)), {
				idCompressor: testIdCompressor,
			});
			assert(decoded.type === "commit");
			assert.deepEqual(decoded.commit.customMetadata, tree);
		});
	});
});
