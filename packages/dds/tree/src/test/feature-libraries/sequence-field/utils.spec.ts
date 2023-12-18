/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeAtomId, mintRevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
import {
	areInputCellsEmpty,
	splitMark,
	tryMergeMarks,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils";
import { brand } from "../../../util";
import { deepFreeze } from "../../utils";
import { TestChange } from "../../testChange";
import { populatedMarks } from "./populatedMarks";

const vestigialEndpoint: ChangeAtomId = { revision: mintRevisionTag(), localId: brand(42) };

describe("SequenceField - Utils", () => {
	describe("round-trip splitMark and tryMergeMarks", () => {
		[
			...populatedMarks,
			populatedMarks
				.filter((mark) => !areInputCellsEmpty(mark))
				.map((mark) => ({ ...mark, vestigialEndpoint })),
		].forEach((mark, index) => {
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
