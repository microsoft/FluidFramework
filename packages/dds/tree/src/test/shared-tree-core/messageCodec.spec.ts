/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { type SessionId, createSessionId } from "@fluidframework/id-compressor";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import type { EncodedRevisionTag, GraphCommit } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeMessageCodec } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import/no-internal-modules
import type { Message } from "../../shared-tree-core/messageFormat.js";
// eslint-disable-next-line import/no-internal-modules
import type { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
import { ajvValidator } from "../codec/index.js";
import { TestChange } from "../testChange.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

const codec = makeMessageCodec(TestChange.codec, testRevisionTagCodec, {
	jsonValidator: ajvValidator,
});

describe("MessageCodec", () => {
	const sessionId: SessionId = "sessionId" as SessionId;
	it("Drops inverse and parent commit fields on encode", () => {
		const revision = testIdCompressor.generateCompressedId();
		const message: DecodedMessage<TestChange> = {
			sessionId,
			commit: {
				revision,
				change: TestChange.mint([], 1),
				inverse: "Extra field that should be dropped" as unknown as TestChange,
				parent: "Extra field that should be dropped" as unknown as GraphCommit<TestChange>,
			},
		};

		const actual = codec.decode(codec.encode(message, {}), {});
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
		const actual = codec.decode(JSON.parse(encoded), {});
		assert.deepEqual(actual, {
			commit: {
				revision: testRevisionTagCodec.decode(revision, { originatorId }),
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
		const actual = codec.decode(JSON.parse(encoded), {});
		assert.deepEqual(actual, {
			commit: {
				revision: testRevisionTagCodec.decode(revision, { originatorId }),
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
			version: 2,
		} satisfies Message);
		assert.throws(
			() => codec.decode(JSON.parse(encoded), {}),
			(e: Error) => validateAssertionError(e, "Unsupported message version"),
			"Expected decoding to fail validation",
		);
	});
});
