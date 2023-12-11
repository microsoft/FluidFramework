/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { splitMark, tryMergeMarks } from "../../../feature-libraries/sequence-field/utils";
import { deepFreeze } from "../../utils";
import { TestChange } from "../../testChange";
import { populatedMarks } from "./populatedMarks";

describe("SequenceField - Utils", () => {
	describe("round-trip splitMark and tryMergeMarks", () => {
		populatedMarks.forEach((mark, index) => {
			it(`${index}: ${"type" in mark ? mark.type : "NoOp"}`, () => {
				const splitable: SF.Mark<TestChange> = { ...mark, count: 3 };
				delete splitable.changes;
				deepFreeze(splitable);
				const [part1, part2] = splitMark(splitable, 2);
				const merged = tryMergeMarks(part1, part2);
				assert.deepEqual(merged, splitable);
			});
		});
	});
});
