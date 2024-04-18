/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import {
	FieldChangeEncodingContext,
	SequenceField as SF,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { ChangeMaker as Change, cases } from "./testEdits.js";

type TestCase = [string, Changeset, FieldChangeEncodingContext];

const sessionId = { originatorId: "session1" as SessionId };
const context: FieldChangeEncodingContext = {
	baseContext: sessionId,
	encodeNode: (node) => TestNodeId.encode(node, sessionId),
	decodeNode: (node) => TestNodeId.decode(node, sessionId),
};

const encodingTestData: EncodingTestData<Changeset, unknown, FieldChangeEncodingContext> = {
	successes: [
		[
			"with child change",
			Change.modify(1, TestNodeId.create({ localId: brand(2) }, TestChange.mint([], 1))),
			context,
		],
		["without child change", Change.remove(2, 2), context],
		[
			"with repair data",
			Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
			context,
		],
		...Object.entries(cases).map<TestCase>(([name, change]) => [name, change, context]),
		...generatePopulatedMarks(testIdCompressor).map<TestCase>((mark) => [
			"type" in mark ? mark.type : "NoOp",
			[mark],
			context,
		]),
	],
};

export function testCodecs() {
	describe("Codecs", () => {
		makeEncodingTestSuite(
			SF.sequenceFieldChangeCodecFactory(testRevisionTagCodec),
			encodingTestData,
		);
	});
}
