/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mintRevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Changeset } from "../../../feature-libraries/sequence-field";
import { TestChange } from "../../testChange";
import { fakeRepair, makeEncodingTestSuite } from "../../utils";
import { ChangeMaker as Change } from "./testEdits";

const encodingTestData: [string, Changeset<TestChange>][] = [
	["with child change", Change.modify(1, TestChange.mint([], 1))],
	["without child change", Change.delete(2, 2)],
	["with repair data", Change.revive(0, 1, mintRevisionTag(), undefined, fakeRepair)],
];

describe("SequenceField encoding", () => {
	makeEncodingTestSuite(SF.sequenceFieldChangeCodecFactory(TestChange.codec), encodingTestData);
});
