/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import {
	type FieldChangeEncodingContext,
	SequenceField as SF,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Changeset } from "../../../feature-libraries/sequence-field/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { ChangeMaker as Change, cases } from "./testEdits.js";
import { inlineRevision } from "./utils.js";

type TestCase = [string, Changeset, FieldChangeEncodingContext];

const tag1 = mintRevisionTag();
const baseContext = {
	originatorId: "session1" as SessionId,
	revision: tag1,
	idCompressor: testIdCompressor,
};
const context: FieldChangeEncodingContext = {
	baseContext,
	encodeNode: (node) => TestNodeId.encode(node, baseContext),
	decodeNode: (node) => TestNodeId.decode(node, baseContext),
};

const encodingTestData: EncodingTestData<Changeset, unknown, FieldChangeEncodingContext> = {
	successes: [
		[
			"with child change",
			inlineRevision(
				Change.modify(1, TestNodeId.create({ localId: brand(2) }, TestChange.mint([], 1))),
				tag1,
			),
			context,
		],
		["without child change", inlineRevision(Change.remove(2, 2), tag1), context],
		[
			"with a revive",
			inlineRevision(
				Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
				tag1,
			),
			context,
		],
		...Object.entries(cases).map<TestCase>(([name, change]) => [
			name,
			inlineRevision(change, tag1),
			context,
		]),
		...generatePopulatedMarks(testIdCompressor).map<TestCase>((mark) => [
			"type" in mark ? mark.type : "NoOp",
			inlineRevision([mark], tag1),
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
