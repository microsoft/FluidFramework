/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field";
import { RevisionTagCodec } from "../../../core";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import {
	EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	MockIdCompressor,
} from "../../utils";
import { populatedMarks } from "./populatedMarks";
import { ChangeMaker as Change, cases } from "./testEdits";

type TestCase = [string, Changeset<TestChange>, SessionId];

const sessionId = "session1" as SessionId;
const encodingTestData: EncodingTestData<Changeset<TestChange>, unknown, SessionId> = {
	successes: [
		["with child change", Change.modify(1, TestChange.mint([], 1)), sessionId],
		["without child change", Change.delete(2, 2), sessionId],
		[
			"with repair data",
			Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
			sessionId,
		],
		...Object.entries(cases).map<TestCase>(([name, change]) => [name, change, sessionId]),
		...populatedMarks.map<TestCase>((mark) => [
			"type" in mark ? mark.type : "NoOp",
			[mark],
			sessionId,
		]),
	],
};

describe("SequenceField encoding", () => {
	makeEncodingTestSuite(
		SF.sequenceFieldChangeCodecFactory(
			TestChange.codec,
			new RevisionTagCodec(new MockIdCompressor()),
		),
		encodingTestData,
	);
});
