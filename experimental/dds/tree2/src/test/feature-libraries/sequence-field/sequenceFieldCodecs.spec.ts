/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mintRevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field";
import { RevisionTagCodec } from "../../../shared-tree-core";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { EncodingTestData, makeEncodingTestSuite } from "../../utils";
import { populatedMarks } from "./populatedMarks";
import { ChangeMaker as Change, cases } from "./testEdits";

const encodingTestData: EncodingTestData<Changeset<TestChange>, unknown> = {
	successes: [
		["with child change", Change.modify(1, TestChange.mint([], 1))],
		["without child change", Change.delete(2, 2)],
		[
			"with repair data",
			Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
		],
		...Object.entries(cases),
		...populatedMarks.map((mark): [string, Changeset<TestChange>] => [
			"type" in mark ? mark.type : "NoOp",
			[mark],
		]),
	],
};

describe("SequenceField encoding", () => {
	makeEncodingTestSuite(
		SF.sequenceFieldChangeCodecFactory(TestChange.codec, new RevisionTagCodec()),
		encodingTestData,
	);
});
