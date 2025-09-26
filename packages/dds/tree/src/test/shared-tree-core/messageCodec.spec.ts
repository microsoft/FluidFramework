/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createSessionId } from "@fluidframework/id-compressor/internal";

import type {
	EncodedRevisionTag,
	GraphCommit,
	ChangeEncodingContext,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeMessageCodec, makeMessageCodecs } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import type { Message } from "../../shared-tree-core/messageFormatV1ToV4.js";
// eslint-disable-next-line import/no-internal-modules
import type { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
import { TestChange } from "../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
	validateUsageError,
} from "../utils.js";

const commit1 = {
	revision: mintRevisionTag(),
	change: TestChange.mint([], 0),
};

const commit2 = {
	revision: mintRevisionTag(),
	change: TestChange.mint([0], [1, 2, 3]),
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
	const family = makeMessageCodecs(TestChange.codecs, testRevisionTagCodec, {
		jsonValidator: FormatValidatorBasic,
	});

	makeEncodingTestSuite(family, testCases);

	describe("dispatching codec", () => {
		const version = 1;
		const codec = makeMessageCodec(
			TestChange.codecs,
			testRevisionTagCodec,
			{
				jsonValidator: FormatValidatorBasic,
			},
			version,
		);

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
				},
			});
		});

		it("accepts unversioned messages as version 1", () => {
			const revision = 1 as EncodedRevisionTag;
			const originatorId = createSessionId();
			const encoded = JSON.stringify({
				revision,
				originatorId,
				changeset: {},
			} satisfies Message);
			const actual = codec.decode(JSON.parse(encoded), { idCompressor: testIdCompressor });
			assert.deepEqual(actual, {
				type: "commit",
				commit: {
					revision: testRevisionTagCodec.decode(revision, {
						originatorId,
						revision: undefined,
						idCompressor: testIdCompressor,
					}),
					change: {},
				},
				sessionId: originatorId,
				branchId: "main",
			} satisfies DecodedMessage<unknown>);
		});

		it("accepts version 1 messages as version 1", () => {
			const revision = 1 as EncodedRevisionTag;
			const originatorId = createSessionId();
			const encoded = JSON.stringify({
				revision,
				originatorId,
				changeset: {},
				version: 1,
			} satisfies Message);
			const actual = codec.decode(JSON.parse(encoded), { idCompressor: testIdCompressor });
			assert.deepEqual(actual, {
				type: "commit",
				commit: {
					revision: testRevisionTagCodec.decode(revision, {
						originatorId,
						revision: undefined,
						idCompressor: testIdCompressor,
					}),
					change: {},
				},
				sessionId: originatorId,
				branchId: "main",
			} satisfies DecodedMessage<unknown>);
		});

		it("rejects messages with invalid versions", () => {
			const revision = 1 as EncodedRevisionTag;
			const originatorId = createSessionId();
			const encoded = JSON.stringify({
				revision,
				originatorId,
				changeset: {},
				version: -1,
			} satisfies Message);
			assert.throws(
				() => codec.decode(JSON.parse(encoded), { idCompressor: testIdCompressor }),
				validateUsageError(/Unsupported version -1 encountered while decoding data/),
			);
		});
	});
});
