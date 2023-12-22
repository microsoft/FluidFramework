/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mintRevisionTag } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field/index.js";
import { RevisionTagCodec } from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { EncodingTestData, makeEncodingTestSuite } from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { ChangeMaker as Change, cases } from "./testEdits.js";

const encodingTestData: EncodingTestData<Changeset<TestChange>, unknown> = {
	successes: [
		["with child change", Change.modify(1, TestChange.mint([], 1))],
		["without child change", Change.delete(2, 2)],
		[
			"with repair data",
			Change.revive(0, 1, { revision: mintRevisionTag(), localId: brand(10) }),
		],
		...Object.entries(cases),
		...generatePopulatedMarks().map((mark): [string, Changeset<TestChange>] => [
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
