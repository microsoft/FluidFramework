/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createSessionId } from "@fluidframework/id-compressor/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type {
	EncodedRevisionTag,
	GraphCommit,
	ChangeEncodingContext,
} from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeMessageCodec, makeMessageCodecs } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import type { Message } from "../../shared-tree-core/messageFormat.js";
// eslint-disable-next-line import/no-internal-modules
import type { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
import { TestChange } from "../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
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
				sessionId: testIdCompressor.localSessionId,
				commit: commit1,
			},
			dummyContext,
		],
		[
			"Message with commit 2",
			{
				sessionId: testIdCompressor.localSessionId,
				commit: commit2,
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
					commit: commit1,
				},
				dummyContext,
			],
			[
				"Missing commit",
				{
					sessionId: "session1",
				},
				dummyContext,
			],
			[
				"Message with invalid sessionId",
				{
					sessionId: 1,
					commit: commit1,
				},
				dummyContext,
			],
			[
				"Message with commit without revision",
				{
					sessionId: "session1",
					commit: commitWithoutRevision,
				},
				dummyContext,
			],
			[
				"Message with invalid commit",
				{
					sessionId: "session1",
					commit: commitInvalid,
				},
				dummyContext,
			],
		],
	},
};

describe("message codec", () => {
	const family = makeMessageCodecs(TestChange.codecs, testRevisionTagCodec, {
		jsonValidator: typeboxValidator,
	});

	makeEncodingTestSuite(family, testCases);

	describe("dispatching codec", () => {
		const version = 1;
		const codec = makeMessageCodec(
			TestChange.codecs,
			testRevisionTagCodec,
			{
				jsonValidator: typeboxValidator,
			},
			version,
		);

		const sessionId: SessionId = "sessionId" as SessionId;
		it("Drops parent commit fields on encode", () => {
			const revision = testIdCompressor.generateCompressedId();
			const message: DecodedMessage<TestChange> = {
				sessionId,
				commit: {
					revision,
					change: TestChange.mint([], 1),
					parent: "Extra field that should be dropped" as unknown as GraphCommit<TestChange>,
				},
			};

			const actual = codec.decode(codec.encode(message, { idCompressor: testIdCompressor }), {
				idCompressor: testIdCompressor,
			});
			assert.deepEqual(actual, {
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
				commit: {
					revision: testRevisionTagCodec.decode(revision, {
						originatorId,
						revision: undefined,
						idCompressor: testIdCompressor,
					}),
					change: {},
				},
				sessionId: originatorId,
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
				commit: {
					revision: testRevisionTagCodec.decode(revision, {
						originatorId,
						revision: undefined,
						idCompressor: testIdCompressor,
					}),
					change: {},
				},
				sessionId: originatorId,
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
				(e: Error) => validateAssertionError(e, "version being decoded is not supported"),
				"Expected decoding to fail validation",
			);
		});
	});
});
