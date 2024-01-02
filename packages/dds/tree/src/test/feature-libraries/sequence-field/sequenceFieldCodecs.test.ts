/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field/index.js";
import { ChangeEncodingContext, RevisionTagCodec } from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	MockIdCompressor,
	testIdCompressor,
} from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { ChangeMaker as Change, cases } from "./testEdits.js";

type TestCase = [string, Changeset<TestChange>, ChangeEncodingContext];

const sessionId = { originatorId: "session1" as SessionId };
const encodingTestData: EncodingTestData<Changeset<TestChange>, unknown, ChangeEncodingContext> = {
	successes: [
		["with child change", Change.modify(1, TestChange.mint([], 1)), sessionId],
		["without child change", Change.remove(2, 2), sessionId],
		[
			"with repair data",
			Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
			sessionId,
		],
		...Object.entries(cases).map<TestCase>(([name, change]) => [name, change, sessionId]),
		...generatePopulatedMarks(testIdCompressor).map<TestCase>((mark) => [
			"type" in mark ? mark.type : "NoOp",
			[mark],
			sessionId,
		]),
	],
};

export function testCodecs() {
	describe("Codecs", () => {
		makeEncodingTestSuite(
			SF.sequenceFieldChangeCodecFactory(
				TestChange.codec,
				new RevisionTagCodec(new MockIdCompressor()),
			),
			encodingTestData,
		);
	});
}
