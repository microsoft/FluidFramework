/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { makeCodecFamily } from "../../codec";
import { typeboxValidator } from "../../external-utilities";
// eslint-disable-next-line import/no-internal-modules
import { makeMessageCodec } from "../../shared-tree-core/messageCodecs";
// eslint-disable-next-line import/no-internal-modules
import { DecodedMessage } from "../../shared-tree-core/messageTypes";
import { RevisionTagCodec } from "../../core";
import { TestChange } from "../testChange";
import {
	EncodingTestData,
	MockIdCompressor,
	makeEncodingTestSuite,
	mintRevisionTag,
} from "../utils";

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

const idCompressor = new MockIdCompressor();
const testCases: EncodingTestData<DecodedMessage<TestChange>, unknown> = {
	successes: [
		[
			"Message with commit 1",
			{
				sessionId: idCompressor.localSessionId,
				commit: commit1,
			},
		],
		[
			"Message with commit 2",
			{
				sessionId: idCompressor.localSessionId,
				commit: commit2,
			},
		],
	],
	failures: {
		0: [
			["Empty message", {}],
			[
				"Missing sessionId",
				{
					commit: commit1,
				},
			],
			[
				"Missing commit",
				{
					sessionId: "session1",
				},
			],
			[
				"Message with invalid sessionId",
				{
					sessionId: 1,
					commit: commit1,
				},
			],
			[
				"Message with commit without revision",
				{
					sessionId: "session1",
					commit: commitWithoutRevision,
				},
			],
			[
				"Message with invalid commit",
				{
					sessionId: "session1",
					commit: commitInvalid,
				},
			],
		],
	},
};

describe("message codec", () => {
	const codec = makeMessageCodec(TestChange.codec, new RevisionTagCodec(idCompressor), {
		jsonValidator: typeboxValidator,
	});

	makeEncodingTestSuite(makeCodecFamily([[0, codec]]), testCases);
});
