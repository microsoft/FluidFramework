/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { makeCodecFamily } from "../../codec/index.js";
import { mintRevisionTag } from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeMessageCodec } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { RevisionTagCodec } from "../../shared-tree-core/revisionTagCodecs.js";
import { useDeterministicStableId } from "../../util/index.js";
import { TestChange } from "../testChange.js";
import { EncodingTestData, makeEncodingTestSuite } from "../utils.js";

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

const testCases = useDeterministicStableId(() => {
	const data: EncodingTestData<DecodedMessage<TestChange>, unknown> = {
		successes: [
			[
				"Message with commit 1",
				{
					sessionId: "session1",
					commit: commit1,
				},
			],
			[
				"Message with commit 2",
				{
					sessionId: "session1",
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

	return data;
});

describe("message codec", () => {
	const codec = makeMessageCodec(TestChange.codec, new RevisionTagCodec(), {
		jsonValidator: typeboxValidator,
	});

	makeEncodingTestSuite(makeCodecFamily([[0, codec]]), testCases);
});
